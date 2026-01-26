import Foundation
import CoreBluetooth
import Combine
import CryptoKit

import ExpoModulesCore

public class BleModule: Module {
  private let notificationCenter: NotificationCenter = .default
  private var bleManager: BleManager? = nil
 
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Ble')` in JavaScript.
    Name("Ble")
    
    // MARK: - initialization
    OnCreate {
      bleManager = BleManager(
        writeObserver: { data, deviceUUID in
          self.sendEvent(
            "onPeripheralReceivedWrite",
            [
              "rawBytes": data,
              "deviceUUID": deviceUUID
            ]
          )
        },
        notifyObserver: { data, deviceUUID in
          self.sendEvent(
            "onCentralReceivedNotification",
            [
              "rawBytes": data,
              "deviceUUID": deviceUUID
            ]
          )
        },
        onPeripheralConnection: { deviceUUID, rssi in
          self.sendEvent(
            "onPeripheralConnection",
            [
              "deviceUUID": deviceUUID,
              "rssi": rssi
            ]
          )
        },
        onPeripheralDisconnect: { deviceUUID, rssi in
          self.sendEvent(
            "onPeripheralDisconnect",
            [
              "deviceUUID": deviceUUID,
              "rssi": rssi
            ]
          )
        },
        onCentralSubscription: { deviceUUID, rssi in
          self.sendEvent(
            "onCentralSubscription",
            [
              "deviceUUID": deviceUUID,
              "rssi": rssi
            ]
          )
        },
        onCentralUnsubscription: { deviceUUID, rssi in
          self.sendEvent(
            "onCentralUnsubscription",
            [
              "deviceUUID": deviceUUID,
              "rssi": rssi
            ]
          )
        },
        onReadRSSI: { deviceUUID, rssi in
          self.sendEvent(
            "onReadRSSI",
            [
              "deviceUUID": deviceUUID,
              "rssi": rssi
            ]
          )
        }
      )
    }
    
    // Defines event names that the module can send to JavaScript.
    Events("onPeripheralReceivedWrite", "onCentralReceivedNotification", "onPeripheralConnection", "onPeripheralDisconnect", "onCentralSubscription", "onCentralUnsubscription", "onReadRSSI")
       
    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("broadcastPacketAsync") { (value: Data, blackoutDeviceUUIDs: [String]) in
      // write to connected peripherals
      // notify subscribed centrals
     if let bm = bleManager {
      print("Broadcasting!")
       bm.broadcastPacket(packet: value, blackoutDeviceUUIDs: blackoutDeviceUUIDs)
     } else {
       print("❌ Failed to broadcast packet")
     }
    }
    
    AsyncFunction("directBroadcastPacketAsync") { (value: Data, deviceUUID: String) in
      // write packet to a specific connected device
      if let bm = bleManager {
        print("Direct broadcasting to \(deviceUUID)")
        bm.directBroadcastPacket(packet: value, deviceUUID: deviceUUID)
      } else {
        print("❌ Failed to direct broadcast packet")
      }
    }
  }
}

final class BleManager: NSObject {
  #if DEBUG
  static let serviceUUID = CBUUID(string: "06b165ec-325c-46c5-8996-d6fa2afb8fb1")
  #else
  static let serviceUUID = CBUUID(string: "6b9d68f5-4651-499c-baec-b36a32b9c521") // mainnet
  #endif
  static let characteristicUUID = CBUUID(string: "560929f8-b9d6-436a-814a-8e8a462997b0")
  private static let centralRestorationID = "chat.bitchat.ble.central"
  private static let peripheralRestorationID = "chat.bitchat.ble.peripheral"
  
  private let bleQueue = DispatchQueue(label: "mesh.bluetooth", qos: .userInitiated)
  private let bleQueueKey = DispatchSpecificKey<Void>()

  // Application state tracking (thread-safe)
  #if os(iOS)
  private var isAppActive: Bool = true  // Assume active initially
  #endif
  
  // MARK - Core State
  
  // 1. Consolidated Peripheral Tracking
  private struct PeripheralState {
      let peripheral: CBPeripheral
      var characteristic: CBCharacteristic?
      var isConnecting: Bool = false
      var isConnected: Bool = false
      var lastConnectionAttempt: Date? = nil
  }
  
  private var peripherals: [String: PeripheralState] = [:]  // UUID -> PeripheralState
  private var recentConnectTimeouts: [String: Date] = [:] // Peripheral UUID -> last timeout
  
  // 2. BLE Centrals (when acting as peripheral)
  private var subscribedCentrals: [CBCentral] = []
  // Accumulate long write chunks per central until a full frame decodes
  private var pendingWriteBuffers: [String: Data] = [:]

  // MARK: - Core BLE Objects
  private var centralManager: CBCentralManager?
  private var peripheralManager: CBPeripheralManager?
  private var characteristic: CBMutableCharacteristic?
  
  // MARK: - Maintenance & Duty Cycle
  private var maintenanceTimer: DispatchSourceTimer?
  private var scanDutyTimer: DispatchSourceTimer?
  private var maintenanceCounter: Int = 0
  
  // RSSI threshold adaptation
  private var dynamicRSSIThreshold: Int = -80
  private var lastIsolatedAt: Date? = nil
  private static let rssiIsolatedBase: Int = -85
  private static let rssiIsolatedRelaxed: Int = -95
  private static let rssiConnectedThreshold: Int = -75
  private static let rssiHighTimeoutThreshold: Int = -70
  private static let isolationRelaxThresholdSeconds: TimeInterval = 30.0
  private static let recentTimeoutWindowSeconds: TimeInterval = 60.0
  private static let recentTimeoutCountThreshold: Int = 3
  
  // Duty cycle parameters
  private var dutyEnabled: Bool = true
  private var dutyActive: Bool = true
  private var dutyOnDuration: TimeInterval = 4.0
  private var dutyOffDuration: TimeInterval = 6.0
  private static let dutyOnDurationDense: TimeInterval = 2.0
  private static let dutyOffDurationDense: TimeInterval = 8.0
  private static let highDegreeThreshold: Int = 5
  private static let recentTrafficForceScanSeconds: TimeInterval = 10.0
  private static let maintenanceInterval: TimeInterval = 10.0
  // Legacy static threshold (used in didDiscover)
  private var rssiThreshold: Int { dynamicRSSIThreshold }
  
  let peripheralWriteObserver: (Data, String) -> Void
  let notifyObserver: (Data, String) -> Void
  let onPeripheralConnection: (String, Int?) -> Void
  let onPeripheralDisconnect: (String, Int?) -> Void
  let onCentralSubscription: (String, Int?) -> Void
  let onCentralUnsubscription: (String, Int?) -> Void
  let onReadRSSI: (String, Int) -> Void
  
  init(
    writeObserver: @escaping (Data, String) -> Void,
    notifyObserver: @escaping (Data, String) -> Void,
    onPeripheralConnection: @escaping (String, Int?) -> Void,
    onPeripheralDisconnect: @escaping (String, Int?) -> Void,
    onCentralSubscription: @escaping (String, Int?) -> Void,
    onCentralUnsubscription: @escaping (String, Int?) -> Void,
    onReadRSSI: @escaping (String, Int) -> Void
  ) {
    self.peripheralWriteObserver = writeObserver
    self.notifyObserver = notifyObserver
    self.onPeripheralConnection = onPeripheralConnection
    self.onPeripheralDisconnect = onPeripheralDisconnect
    self.onCentralSubscription = onCentralSubscription
    self.onCentralUnsubscription = onCentralUnsubscription
    self.onReadRSSI = onReadRSSI
    super.init()
    
    // Set up application state tracking (iOS only)
    #if os(iOS)
    // Check initial state on main thread
    if Thread.isMainThread {
      isAppActive = UIApplication.shared.applicationState == .active
    } else {
      DispatchQueue.main.sync {
        isAppActive = UIApplication.shared.applicationState == .active
      }
    }

    // Observe application state changes
    NotificationCenter.default.addObserver(
        self,
        selector: #selector(appDidBecomeActive),
        name: UIApplication.didBecomeActiveNotification,
        object: nil
    )
    NotificationCenter.default.addObserver(
        self,
        selector: #selector(appDidEnterBackground),
        name: UIApplication.didEnterBackgroundNotification,
        object: nil
    )
    #endif
    
    // Tag BLE queue for re-entrancy detection
    bleQueue.setSpecific(key: bleQueueKey, value: ())
    
    // Initialize BLE on background queue to prevent main thread blocking
    #if os(iOS)
    let centralOptions: [String: Any] = [
      CBCentralManagerOptionRestoreIdentifierKey: BleManager.centralRestorationID
    ]
    centralManager = CBCentralManager(delegate: self, queue: bleQueue, options: centralOptions)
    
     let peripheralOptions: [String: Any] = [
       CBPeripheralManagerOptionRestoreIdentifierKey: BleManager.peripheralRestorationID
     ]
     peripheralManager = CBPeripheralManager(delegate: self, queue: bleQueue, options: peripheralOptions)
     #else
     centralManager = CBCentralManager(delegate: self, queue: bleQueue)
     peripheralManager = CBPeripheralManager(delegate: self, queue: bleQueue)
     #endif
    
    // Start maintenance timer for periodic housekeeping
    let timer = DispatchSource.makeTimerSource(queue: bleQueue)
    timer.schedule(deadline: .now() + BleManager.maintenanceInterval,
                   repeating: BleManager.maintenanceInterval,
                   leeway: .seconds(1))
    timer.setEventHandler { [weak self] in
      self?.performMaintenance()
    }
    timer.resume()
    maintenanceTimer = timer
  }
  
  deinit {
    maintenanceTimer?.cancel()
    scanDutyTimer?.cancel()
    centralManager?.stopScan()
    peripheralManager?.stopAdvertising()
    #if os(iOS)
    NotificationCenter.default.removeObserver(self)
    #endif
  }
  
  #if os(iOS)
  @objc func appDidBecomeActive() {
      isAppActive = true
      // Restart scanning with allow duplicates when app becomes active
      if centralManager?.state == .poweredOn {
        centralManager?.stopScan()
        startScanning()
      }
  //    logBluetoothStatus("became-active")
  //    scheduleBluetoothStatusSample(after: 5.0, context: "active-5s")
      // No Local Name; nothing to refresh for advertising policy
  }

  @objc func appDidEnterBackground() {
      isAppActive = false
      // Restart scanning without allow duplicates in background
      if centralManager?.state == .poweredOn {
          centralManager?.stopScan()
          startScanning()
      }
  //    logBluetoothStatus("entered-background")
  //    scheduleBluetoothStatusSample(after: 15.0, context: "background-15s")
      // No Local Name; nothing to refresh for advertising policy
  }
  #endif
  
  func broadcastPacket(packet: Data, blackoutDeviceUUIDs: [String]) {
    let peripheralStates = snapshotPeripheralStates()
    let connectedPeripheralIds: [String] = peripheralStates
      .filter { $0.isConnected }
      .map { $0.peripheral.identifier.uuidString }
    
    let subscribedCentrals: [CBCentral]
    if let _ = characteristic {
      let centrals = snapshotSubscribedCentrals()
      subscribedCentrals = centrals
    } else {
      subscribedCentrals = []
    }
    
    print("Connected Peripherals: \(connectedPeripheralIds)")
    print("Subscribed Centrals: \(subscribedCentrals.map { $0.identifier.uuidString })")
    
    // writes to selected connected peripherals
    for s in peripheralStates where s.isConnected {
      let pid = s.peripheral.identifier.uuidString
      guard !blackoutDeviceUUIDs.contains(pid) else { continue }
      guard connectedPeripheralIds.contains(pid) else { continue }
      print("past connected peripheral id guard")
      if let ch = s.characteristic {
        print("through characteristic check")
        bleQueue.async { [weak self] in
          if s.peripheral.canSendWriteWithoutResponse {
            print("writing to connected peripheral")
            s.peripheral.writeValue(packet, for: ch, type: .withoutResponse)
          }
        }
      }
    }
    
    // notify selected subscribed centrals
    if let ch = characteristic {
      let targets = subscribedCentrals.filter { !blackoutDeviceUUIDs.contains($0.identifier.uuidString) }
      if !targets.isEmpty {
        _ = peripheralManager?.updateValue(packet, for: ch, onSubscribedCentrals: targets)
      }
    }
  }
  
  func directBroadcastPacket(packet: Data, deviceUUID: String) {
    let peripheralStates = snapshotPeripheralStates()
    let subscribedCentrals = snapshotSubscribedCentrals()
    
    // Try to find matching connected peripheral
    if let state = peripheralStates.first(where: { $0.peripheral.identifier.uuidString == deviceUUID && $0.isConnected }) {
      if let ch = state.characteristic {
        bleQueue.async { [weak self] in
          if state.peripheral.canSendWriteWithoutResponse {
            print("✅ Direct write to peripheral \(deviceUUID)")
            state.peripheral.writeValue(packet, for: ch, type: .withoutResponse)
          } else {
            print("⚠️ Peripheral \(deviceUUID) cannot send write without response")
          }
        }
        return
      }
    }
    
    // Try to find matching subscribed central
    if let central = subscribedCentrals.first(where: { $0.identifier.uuidString == deviceUUID }) {
      if let ch = characteristic {
        let success = peripheralManager?.updateValue(packet, for: ch, onSubscribedCentrals: [central]) ?? false
        if success {
          print("✅ Direct notify to central \(deviceUUID)")
        } else {
          print("⚠️ Failed to notify central \(deviceUUID)")
        }
        return
      }
    }
    
    print("❌ Device \(deviceUUID) not found in connected peripherals or subscribed centrals")
  }
  
  // MARK: Link capability snapshots (thread-safe via bleQueue)
  
  private func snapshotPeripheralStates() -> [PeripheralState] {
      if DispatchQueue.getSpecific(key: bleQueueKey) != nil {
          return Array(peripherals.values)
      } else {
          return bleQueue.sync { Array(peripherals.values) }
      }
  }
  private func snapshotSubscribedCentrals() -> [CBCentral] {
      if DispatchQueue.getSpecific(key: bleQueueKey) != nil {
          return self.subscribedCentrals
      } else {
          return bleQueue.sync { self.subscribedCentrals }
      }
  }
}

// MARK: - CBCentralManagerDelegate
extension BleManager: CBCentralManagerDelegate {
    
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
      // Notify delegate about state change on main thread
//      Task { @MainActor in
//        self.delegate?.didUpdateBluetoothState(central.state)
//      }
      
      switch central.state {
        case .poweredOn:
            print("✅ BLE Central: Powered On")
            // Start scanning for peripherals. Use allow duplicates for faster discovery when active
             startScanning()
        case .poweredOff:
            print("❌ BLE Central: Powered Off")
        case .resetting:
            print("⚠️ BLE Central: Resetting")
        case .unauthorized:
            print("❌ BLE Central: Unauthorized")
        case .unsupported:
            print("❌ BLE Central: Unsupported")
        case .unknown:
            print("⚠️ BLE Central: Unknown state")
        @unknown default:
            print("⚠️ BLE Central: Unknown state (future)")
        }
    }
    
    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        // print("📡 Discovered peripheral: \(peripheral.identifier.uuidString) RSSI: \(RSSI)")
        
        // Handle discovered peripheral
        // Example: Connect to peripheral if needed
        // central.connect(peripheral, options: nil)
      let peripheralId = peripheral.identifier.uuidString
      let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? (peripheralId.prefix(6) + "...")
      let isConnectable = (advertisementData[CBAdvertisementDataIsConnectable] as? NSNumber)?.boolValue ?? true
      let rssiValue = RSSI.intValue
      
      // Skip if peripheral is not connectable
      guard isConnectable else { return }
      
      // Skip immediate connect if signal too weak for current conditions; enqueue instead (todo)
      if rssiValue <= rssiThreshold {
        return
      }
      
      // Check if we alread have this peripheral
      if let state = peripherals[peripheralId] {
        if state.isConnected || state.isConnecting {
          return // already connected or connecting
        }
        
        // Add backoff for reconnection attempts
        if let lastAttempt = state.lastConnectionAttempt {
          let timeSinceLastAttempt = Date().timeIntervalSince(lastAttempt)
          if timeSinceLastAttempt < 2.0 {
            return // wait at least 2 seconds between connection attempts
          }
        }
      }
      
      // Backoff if this peripheral recently itmed out connection within the last 15 seconds
      if let lastTimeout = recentConnectTimeouts[peripheralId], Date().timeIntervalSince(lastTimeout) < 15 {
        return
      }
      
      // Check peripheral state, cancel if stale
      if peripheral.state == .connecting || peripheral.state == .connected {
        // iOS might have stale state - force disconnect and retry
        central.cancelPeripheralConnection(peripheral)
        // will retry on next discovery
        return
      }
        
      // Discovered ble peripheral
      // store the peripheral and mark as connecting
      peripherals[peripheralId] = PeripheralState(
        peripheral: peripheral,
        characteristic: nil,
        isConnecting: true,
        isConnected: false,
        lastConnectionAttempt: Date()
      )
      
      peripheral.delegate = self
      
      print("Connect: \(advertisedName) [RSSI: \(rssiValue)]")
      
      let options: [String: Any] = [
        CBConnectPeripheralOptionNotifyOnConnectionKey: true,
        CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
        CBConnectPeripheralOptionNotifyOnNotificationKey: true,
      ]
      
      central.connect(peripheral, options: options)
      
      // set a timeout for the connection attempt (slightly longer for reliability)
      // Use ble queue to mutate ble related state consistently
      bleQueue.asyncAfter(deadline: .now() + 10) { [weak self] in
        guard let self = self,
              let state = self.peripherals[peripheralId],
              state.isConnecting && !state.isConnected else { return }
        
        print("Timeout: \(advertisedName)")
        
        central.cancelPeripheralConnection(peripheral)
        self.peripherals[peripheralId] = nil
        self.recentConnectTimeouts[peripheralId] = Date()
      }
    }
    
    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
      let peripheralId = peripheral.identifier.uuidString
      print("✅ Connected to peripheral: \(peripheralId)")
      
      // update state to connected
      if var state = peripherals[peripheralId] {
        state.isConnecting = false
        state.isConnected = true
        peripherals[peripheralId] = state
      } else {
        // Create new state if not found
        peripherals[peripheralId] = PeripheralState(
          peripheral: peripheral,
          characteristic: nil,
          isConnecting: false,
          isConnected: true,
          lastConnectionAttempt: nil
        )
      }
      
      // reset backoff state to success
      recentConnectTimeouts.removeValue(forKey: peripheralId)
      
      print("✅ Connected: \(peripheral.name ?? "Unknown") [\(peripheralId)]")
      
      peripheral.readRSSI()
       
      // discover services
      peripheral.discoverServices([BleManager.serviceUUID])
    }
    
    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        if let error = error {
            print("❌ Failed to connect to peripheral: \(peripheral.identifier.uuidString) - Error: \(error.localizedDescription)")
        } else {
            print("❌ Failed to connect to peripheral: \(peripheral.identifier.uuidString)")
        }
      
      let peripheralId = peripheral.identifier.uuidString
      
      // clean up references
      peripherals.removeValue(forKey: peripheralId)
    }
    
    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
      if let error = error {
          print("⚠️ Disconnected from peripheral: \(peripheral.identifier.uuidString) - Error: \(error.localizedDescription)")
      } else {
          print("ℹ️ Disconnected from peripheral: \(peripheral.identifier.uuidString)")
      }
      
      let peripheralId = peripheral.identifier.uuidString
      
      // if disconnect carried an error (often timeout), apply short backoff to avoid thrash
      if error != nil {
        recentConnectTimeouts[peripheralId] = Date()
      }
      
      // clean up references
      peripherals.removeValue(forKey: peripheralId)
      
      onPeripheralDisconnect(peripheralId, nil)
      
      // restart scanning with allow duplicates for faster re-discovery
      if centralManager?.state == .poweredOn {
        // stop and restart scanning to ensure we get fresh discovery events
        centralManager?.stopScan()
        bleQueue.asyncAfter(deadline: .now() + 2.0) { [weak self] in
          self?.startScanning()
        }
      }
    }
    
    #if os(iOS)
    public func centralManager(_ central: CBCentralManager, willRestoreState dict: [String : Any]) {
      print("🔄 BLE Central: Restoring state")
      let restoredPeripherals = (dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral]) ?? []
      let restoredServices = (dict[CBCentralManagerRestoredStateScanServicesKey] as? [CBUUID]) ?? []
      let restoredOptions = (dict[CBCentralManagerRestoredStateScanOptionsKey] as? [String: Any]) ?? [:]
      let allowDuplicates = restoredOptions[CBCentralManagerScanOptionAllowDuplicatesKey] as? Bool
      
      for peripheral in restoredPeripherals {
        let identifier = peripheral.identifier.uuidString
        peripheral.delegate = self
        let existing = peripherals[identifier]
        let characteristic = existing?.characteristic
        let wasConnecting = existing?.isConnecting ?? false
        let wasConnected = existing?.isConnected ?? false
          
        let restoredState = PeripheralState(
          peripheral: peripheral,
          characteristic: characteristic,
          isConnecting: wasConnecting || peripheral.state == .connecting,
          isConnected: wasConnected || peripheral.state == .connected,
          lastConnectionAttempt: existing?.lastConnectionAttempt
        )
        
        peripherals[identifier] = restoredState
      }

      if central.state == .poweredOn {
        startScanning()
      }
    }
    #endif
  
  private func startScanning() {
    print("Attempting to start scanning")
    
    let central = centralManager!
    
    guard central.state == .poweredOn else { return }
            
            print("central powered on in start scan")
            
    guard !central.isScanning else { return }
    
    print("central is not already scanning")

      guard let central = centralManager,
            central.state == .poweredOn,
            !central.isScanning else { return }
      
      // Use allow duplicates = true for faster discovery in foreground
      // This gives us discovery events immediately instead of coalesced
      #if os(iOS)
      let allowDuplicates = isAppActive  // Use our tracked state (thread-safe)
      #else
      let allowDuplicates = true  // macOS doesn't have background restrictions
      #endif
      
      central.scanForPeripherals(
              withServices: [BleManager.serviceUUID],
          options: [CBCentralManagerScanOptionAllowDuplicatesKey: allowDuplicates]
      )
      
      // Started BLE scanning
      print("✅ Central started scanning")
  }
}

// MARK: - CBPeripheralManagerDelegate
extension BleManager: CBPeripheralManagerDelegate {
    
    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
      print("📡 Peripheral manager state: \(peripheral.state.rawValue)")
      
      switch peripheral.state {
        case .poweredOn:
          print("✅ BLE Peripheral: Powered On")
        
          // remove all services first to ensure clean slate
          peripheral.removeAllServices()
          
          // create characteristic
          characteristic = CBMutableCharacteristic(
            type: BleManager.characteristicUUID,
            properties: [.notify, .write, .writeWithoutResponse, .read],
            value: nil,
            permissions: [.readable, .writeable]
          )
          
          // create service
          let service = CBMutableService(type: BleManager.serviceUUID, primary: true)
          service.characteristics = [characteristic!]
           // Add service (advertising will start in didAdd delegate)
          print("🔧 Adding BLE service...")
          peripheral.add(service)
        case .poweredOff:
            print("❌ BLE Peripheral: Powered Off")
        case .resetting:
            print("⚠️ BLE Peripheral: Resetting")
        case .unauthorized:
            print("❌ BLE Peripheral: Unauthorized")
        case .unsupported:
            print("❌ BLE Peripheral: Unsupported")
        case .unknown:
            print("⚠️ BLE Peripheral: Unknown state")
        @unknown default:
            print("⚠️ BLE Peripheral: Unknown state (future)")
        }
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error = error {
            print("❌ Failed to add service: \(service.uuid) - Error: \(error.localizedDescription)")
            return
        }
      
        print("✅ Service added successfully: \(service.uuid)")
        
        // Start advertising after service is added
      let adData = buildAdvertisementData()
      peripheral.startAdvertising(adData)
    }
    
    public func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            print("❌ Failed to start advertising - Error: \(error.localizedDescription)")
            return
        }
        print("✅ Started advertising")
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        print("✅ Central subscribed: \(central.identifier.uuidString) to characteristic: \(characteristic.uuid)")
        
        // Only track centrals that subscribe to our Yantagram characteristic
        guard characteristic.uuid == BleManager.characteristicUUID else {
            print("⚠️ Central subscribed to unknown characteristic, ignoring")
            return
        }
        
        // Track subscribed centrals
        // Can now send notifications to this central
      subscribedCentrals.append(central)
      
      // Check if we're also connected to this device as a peripheral (bidirectional connection)
      // If so, we can read RSSI via the peripheral object
      let centralUUID = central.identifier.uuidString
      if let state = peripherals[centralUUID], state.isConnected {
        state.peripheral.readRSSI()
      }
      
      onCentralSubscription(central.identifier.uuidString, nil)
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        print("ℹ️ Central unsubscribed: \(central.identifier.uuidString) from characteristic: \(characteristic.uuid)")
        
        // Only handle unsubscribe for our Yantagram characteristic
        guard characteristic.uuid == BleManager.characteristicUUID else {
            return
        }
        
        // Remove from tracked centrals
      subscribedCentrals.removeAll { $0.identifier == central.identifier }
      
      // Notify JavaScript about the unsubscription
      onCentralUnsubscription(central.identifier.uuidString, nil)
      
      // Ensure we're still advertising for other devices to find us
      if peripheral.isAdvertising == false {
        peripheral.startAdvertising(buildAdvertisementData())
      }
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        print("📖 Received read request from central: \(request.central.identifier.uuidString)")
        print("   Characteristic: \(request.characteristic.uuid)")
        print("   Offset: \(request.offset)")
        
        // Handle read request
        if request.characteristic.uuid == BleManager.characteristicUUID {
            if let characteristicValue = characteristic?.value {
                if request.offset > characteristicValue.count {
                    peripheral.respond(to: request, withResult: .invalidOffset)
                    return
                }
                
                // Respond with data from the requested offset
                request.value = characteristicValue.subdata(in: request.offset..<characteristicValue.count)
                peripheral.respond(to: request, withResult: .success)
                print("✅ Responded to read request with \(request.value?.count ?? 0) bytes")
            } else {
                peripheral.respond(to: request, withResult: .attributeNotFound)
            }
        } else {
            peripheral.respond(to: request, withResult: .requestNotSupported)
        }
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
      print("✍️ Received \(requests.count) write request(s)")
      
      // IMPORTANT: respond immediately to prevent timeouts
      // we must respond within a few ms or the central will timeout
      for request in requests {
        peripheral.respond(to: request, withResult: .success)
      }
      
      // process writes. For long writes, CoreBluetooth may deliver multiple CBATTRequest values with offsets
      // combing per-central request values by offset before decoding
      // process directly on our message queue to match transport context
      let grouped = Dictionary(grouping: requests, by: { $0.central.identifier.uuidString })
      for (centralUUID, group) in grouped {
        // sort by offset ascending
        let sorted = group.sorted { $0.offset < $1.offset }
        let hasMultiple = sorted.count > 1 || (sorted.first?.offset ?? 0) > 0
        
        // always merge into a persistent per-central buffer to handle multi-callback long writes
        var combined = pendingWriteBuffers[centralUUID] ?? Data()
        var appendedBytes = 0
        var offsets: [Int] = []
        for r in sorted {
          guard let chunk = r.value, !chunk.isEmpty else { continue }
          offsets.append(r.offset)
          let end = r.offset + chunk.count
          if combined.count < end {
            combined.append(Data(repeating: 0, count: end - combined.count))
          }
          // write chunk into the correct position (supports out-of-order and overlapping writes)
          combined.replaceSubrange(r.offset..<end, with: chunk)
          appendedBytes += chunk.count
        }
        
        // pending write buffer currently not used
        pendingWriteBuffers[centralUUID] = combined
        
        // send combined back to react native layer
        peripheralWriteObserver(combined, centralUUID)
        
        // clear buffer on success
        pendingWriteBuffers.removeValue(forKey: centralUUID)
      }
    }
    
    public func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        print("✅ Peripheral ready to update subscribers")
        
        // Queue may have been blocked, can now send notifications
        // Retry any pending notifications
    }
    
    #if os(iOS)
    public func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String : Any]) {
      print("🔄 BLE Peripheral: Restoring state")
      
      let restoredServices = (dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService]) ?? []
      let restoredAdvertisement = (dict[CBPeripheralManagerRestoredStateAdvertisementDataKey] as? [String: Any]) ?? [:]
      
      print("Peripheral restore: services=\(restoredServices.count) advertisingDataKeys=\(Array(restoredAdvertisement.keys))")
      
      // attempt to recover characteristic from restored services
      if characteristic == nil {
        if let service = restoredServices.first(where: { $0.uuid == BleManager.serviceUUID }),
           let restoredCharacteristic = service.characteristics?.first(where: { $0.uuid == BleManager.characteristicUUID }) as? CBMutableCharacteristic {
          characteristic = restoredCharacteristic
        }
      }
      
      if peripheral.state == .poweredOn && !peripheral.isAdvertising {
        peripheral.startAdvertising(buildAdvertisementData())
      }
    }
    #endif
}

// MARK: - CBPeripheralDelegate
extension BleManager: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?)  {
    if let error = error {
            print("❌ Error discovering services for \(peripheral.name ?? "Unknown"): \(error.localizedDescription)")
            // Retry service discovery after a delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                guard peripheral.state == .connected else { return }
                peripheral.discoverServices([BleManager.serviceUUID])
            }
            return
        }
        
        guard let services = peripheral.services else {
            print("⚠️ No services discovered for \(peripheral.name ?? "Unknown")")
            return
        }
        
        guard let service = services.first(where: { $0.uuid == BleManager.serviceUUID }) else {
            // Not a BitChat peer - disconnect
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }

        onPeripheralConnection(peripheral.identifier.uuidString, nil)
        
        // Discovering BLE characteristics
        peripheral.discoverCharacteristics([BleManager.characteristicUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
      if let error = error {
          print("⚠️ Error reading RSSI: \(error.localizedDescription)")
          return
      }
      
      let rssiValue = RSSI.intValue
      print("📶 RSSI for \(peripheral.identifier.uuidString): \(rssiValue) dBm")
      
      // Optionally disconnect if signal becomes too weak
      if rssiValue <= rssiThreshold {
          centralManager?.cancelPeripheralConnection(peripheral)
      } else {
        self.onReadRSSI(peripheral.identifier.uuidString, rssiValue)
      }
  }
  
  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
          if let error = error {
              print("❌ Error discovering characteristics for \(peripheral.name ?? "Unknown"): \(error.localizedDescription)")
              return
          }
          
          guard let characteristic = service.characteristics?.first(where: { $0.uuid == BleManager.characteristicUUID }) else {
              print("⚠️ No matching characteristic found for \(peripheral.name ?? "Unknown")")
              return
          }
          
          // Found characteristic
          
          // Log characteristic properties for debugging
          var properties: [String] = []
          if characteristic.properties.contains(.read) { properties.append("read") }
          if characteristic.properties.contains(.write) { properties.append("write") }
          if characteristic.properties.contains(.writeWithoutResponse) { properties.append("writeWithoutResponse") }
          if characteristic.properties.contains(.notify) { properties.append("notify") }
          if characteristic.properties.contains(.indicate) { properties.append("indicate") }
          // Characteristic properties: \(properties.joined(separator: ", "))
          
          // Verify characteristic supports reliable writes
          if !characteristic.properties.contains(.write) {
              print("⚠️ Characteristic doesn't support reliable writes (withResponse)!")
          }
    
          print("Discovered characteristic for peripheral")
          
          // Store characteristic in our consolidated structure
          let peripheralID = peripheral.identifier.uuidString
          if var state = peripherals[peripheralID] {
              state.characteristic = characteristic
              peripherals[peripheralID] = state
          }
          
          // Subscribe for notifications
          if characteristic.properties.contains(.notify) {
              peripheral.setNotifyValue(true, for: characteristic)
              print("🔔 Subscribed to notifications from \(peripheral.name ?? "Unknown")")
          } else {
              print("⚠️ Characteristic does not support notifications")
          }
      }
  
  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
      if let error = error {
          print("❌ Error receiving notification: \(error.localizedDescription)")
          return
      }
      
      guard let data = characteristic.value, !data.isEmpty else {
          print("⚠️ No data in notification")
          return
      }

      print("🔔 Central received notification from peripheral")

      let peripheralUUID = peripheral.identifier.uuidString

      var state = peripherals[peripheralUUID] ?? PeripheralState(
          peripheral: peripheral,
          characteristic: nil,
          isConnecting: false,
          isConnected: peripheral.state == .connected,
          lastConnectionAttempt: nil
      )
      
      peripherals[peripheralUUID] = state
      
    self.notifyObserver(data, peripheral.identifier.uuidString)
  }
  
}

// MARK: - PrivateHelpers
extension BleManager {
  private func captureBluetoothStatus(context: String) {
    assert(DispatchQueue.getSpecific(key: bleQueueKey) != nil, "captureBluetoothStatus must run on bleQueue")
    
    let centralState = centralManager?.state ?? .unknown
    let isScanning = centralManager?.isScanning ?? false
    let peripheralState = peripheralManager?.state ?? .unknown
    let isAdvertising = peripheralManager?.isAdvertising ?? false
  }
  
  private func buildAdvertisementData() -> [String: Any] {
    let data: [String: Any] = [
      CBAdvertisementDataServiceUUIDsKey: [BleManager.serviceUUID]
    ]
    // no local name for privacy
    return data
  }
}

// MARK: - Maintenance
extension BleManager {
  
  /// Consolidated maintenance called periodically (every 10s)
  private func performMaintenance() {
    maintenanceCounter += 1
    
    let connectedPeripheralCount = peripherals.values.filter { $0.isConnected }.count
    let connectedCentralCount = subscribedCentrals.count
    let connectedCount = connectedPeripheralCount + connectedCentralCount
    
    // If we have no connections, ensure we're advertising as peripheral
    if connectedCount == 0 {
      if let pm = peripheralManager, pm.state == .poweredOn && !pm.isAdvertising {
        pm.startAdvertising(buildAdvertisementData())
      }
    }
    
    // Update scanning duty-cycle based on connectivity
    updateScanningDutyCycle(connectedCount: connectedCount)
    
    // Update RSSI threshold based on connectivity
    updateRSSIThreshold(connectedCount: connectedCount)
    
    // Check connection health every cycle
    checkConnectionHealth()
    
    // Every 30 seconds (3 cycles): cleanup old timeout entries
    if maintenanceCounter % 3 == 0 {
      performCleanup()
    }
    
    // Reset counter to prevent overflow (every 60 seconds)
    if maintenanceCounter >= 6 {
      maintenanceCounter = 0
    }
    
    print("🔧 Maintenance: connected=\(connectedCount), rssi=\(dynamicRSSIThreshold), scanning=\(centralManager?.isScanning ?? false)")
  }
  
  /// Check for stale connections and clean up
  private func checkConnectionHealth() {
    let now = Date()
    var disconnectedPeripheralIDs: [String] = []
    
    // Check peripherals for stale connections
    for (peripheralId, state) in peripherals {
      if state.isConnected {
        // Check if the underlying peripheral is still connected
        if state.peripheral.state != .connected {
          print("🔌 Peripheral \(peripheralId) no longer connected")
          disconnectedPeripheralIDs.append(peripheralId)
        }
      }
    }
    
    // Clean up disconnected peripherals and notify JS
    for peripheralId in disconnectedPeripheralIDs {
      if var state = peripherals[peripheralId] {
        state.isConnected = false
        state.isConnecting = false
        peripherals[peripheralId] = state
      }
      // Notify JavaScript about the disconnection
      onPeripheralDisconnect(peripheralId, nil)
    }
  }
  
  /// Update scanning duty cycle based on connection state
  private func updateScanningDutyCycle(connectedCount: Int) {
    guard let central = centralManager, central.state == .poweredOn else { return }
    
    // Determine if we should use duty cycling
    #if os(iOS)
    let active = isAppActive
    #else
    let active = true
    #endif
    
    // Force full-time scanning if we have very few neighbors
    let forceScanOn = connectedCount <= 2
    let shouldDuty = dutyEnabled && active && connectedCount > 0 && !forceScanOn
    
    if shouldDuty {
      if scanDutyTimer == nil {
        // Start timer to toggle scanning on/off
        let t = DispatchSource.makeTimerSource(queue: bleQueue)
        
        // Start with scanning ON
        if !central.isScanning { startScanning() }
        dutyActive = true
        
        // Adjust duty cycle under dense networks to save battery
        if connectedCount >= BleManager.highDegreeThreshold {
          dutyOnDuration = BleManager.dutyOnDurationDense
          dutyOffDuration = BleManager.dutyOffDurationDense
        } else {
          dutyOnDuration = 4.0
          dutyOffDuration = 6.0
        }
        
        t.schedule(deadline: .now() + dutyOnDuration, repeating: dutyOnDuration + dutyOffDuration)
        t.setEventHandler { [weak self] in
          guard let self = self, let c = self.centralManager else { return }
          if self.dutyActive {
            // Turn OFF scanning for offDuration
            if c.isScanning { c.stopScan() }
            self.dutyActive = false
            // Schedule turning back ON after offDuration
            self.bleQueue.asyncAfter(deadline: .now() + self.dutyOffDuration) {
              if self.centralManager?.state == .poweredOn { self.startScanning() }
              self.dutyActive = true
            }
          }
        }
        t.resume()
        scanDutyTimer = t
      }
    } else {
      // Cancel duty cycle and ensure scanning is ON for discovery
      scanDutyTimer?.cancel()
      scanDutyTimer = nil
      if !central.isScanning { startScanning() }
    }
  }
  
  /// Adjust RSSI threshold based on connectivity and failure patterns
  private func updateRSSIThreshold(connectedCount: Int) {
    if connectedCount == 0 {
      // Isolated: relax threshold slowly to hunt for distant nodes
      if lastIsolatedAt == nil { lastIsolatedAt = Date() }
      let elapsed = Date().timeIntervalSince(lastIsolatedAt ?? Date())
      if elapsed > BleManager.isolationRelaxThresholdSeconds {
        dynamicRSSIThreshold = BleManager.rssiIsolatedRelaxed
      } else {
        dynamicRSSIThreshold = BleManager.rssiIsolatedBase
      }
      return
    }
    
    lastIsolatedAt = nil
    
    // Base threshold when connected
    var threshold = -80
    
    // If we have many links or many connection candidates, prefer closer peers
    let linkCount = peripherals.values.filter { $0.isConnected || $0.isConnecting }.count
    if linkCount >= 8 { // At connection budget
      threshold = BleManager.rssiConnectedThreshold
    }
    
    // If we have many recent timeouts, raise threshold further
    let recentTimeouts = recentConnectTimeouts.filter {
      Date().timeIntervalSince($0.value) < BleManager.recentTimeoutWindowSeconds
    }.count
    
    if recentTimeouts >= BleManager.recentTimeoutCountThreshold {
      threshold = max(threshold, BleManager.rssiHighTimeoutThreshold)
    }
    
    dynamicRSSIThreshold = threshold
  }
  
  /// Cleanup old entries
  private func performCleanup() {
    let now = Date()
    
    // Clean old connection timeout backoff entries
    let timeoutCutoff = now.addingTimeInterval(-15.0) // 15 seconds
    recentConnectTimeouts = recentConnectTimeouts.filter { $0.value >= timeoutCutoff }
    
    // Clean stale peripheral entries that are neither connected nor connecting
    let staleCutoff = now.addingTimeInterval(-60.0) // 1 minute
    for (peripheralId, state) in peripherals {
      if !state.isConnected && !state.isConnecting {
        if let lastAttempt = state.lastConnectionAttempt, lastAttempt < staleCutoff {
          peripherals.removeValue(forKey: peripheralId)
          print("🗑️ Cleaned up stale peripheral entry: \(peripheralId)")
        }
      }
    }
  }
}
