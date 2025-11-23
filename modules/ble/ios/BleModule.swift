import Foundation
import CoreBluetooth
import Combine
import CryptoKit

import ExpoModulesCore

struct PeerID: Hashable {
  let bare: String
}

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
        writeObserver: { data in
          self.sendEvent(
            "onPeripheralReceivedWrite",
            [
              "rawBytes": data
            ]
          )
        },
        notifyObserver: { data in
          self.sendEvent(
            "onCentralReceivedNotification",
            [
              "rawBytes": data
            ]
          )
        }
      )
    }
    
    // OnDestroy {
    //   <#code#>
    // }
  
    // Defines constant property on the module.
    Constant("PI") {
      Double.pi
    }
    
    // Defines event names that the module can send to JavaScript.
    Events("onPeripheralReceivedWrite", "onCentralReceivedNotification")
    
    OnStartObserving("onPeripheralReceivedWrite") {
      // bleManager = BleManager(
      //   writeObserver: { data in
      //     self.sendEvent(
      //       "onPeripheralReceivedWrite",
      //       [
      //         "rawBytes": data
      //       ]
      //     )
      //   },
      //   notifyObserver: { data in
      //     self.sendEvent(
      //       "onCentralReceivedNotification",
      //       [
      //         "rawBytes": data
      //       ]
      //     )
      //   }
      // )
    }
    
    // OnStopObserving("onPeripheralReceivedWrite") {
    //   <#code#>
    // }
    
    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      return "Hello world! 👋"
    }
    
    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { (value: String) in
      // Send an event to JavaScript.
      self.sendEvent("onChange", [
        "value": value
      ])
    }
    
    AsyncFunction("broadcastPacketAsync") { (value: Data) in
      // write to connected peripherals
      // notify subscribed centrals
     if let bm = bleManager {
      print("Broadcasting!")
       bm.broadcastPacket(packet: value)
     } else {
       print("❌ Failed to broadcast packet")
     }
    }
  }
}

final class TestManager: NSObject {
  init(writeObserver: @escaping (Data) -> Void, notifyObserver: @escaping (Data) -> Void) {
    super.init()
  }
}


final class BleManager: NSObject {
  #if DEBUG
  static let serviceUUID = CBUUID(string: "F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5A") // testnet
  #else
  static let serviceUUID = CBUUID(string: "F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C") // mainnet
  #endif
  static let characteristicUUID = CBUUID(string: "A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D")
  private static let centralRestorationID = "chat.bitchat.ble.central"
  private static let peripheralRestorationID = "chat.bitchat.ble.peripheral"
  
  private let collectionsQueue = DispatchQueue(label: "mesh.collections", attributes: .concurrent)
  private let bleQueue = DispatchQueue(label: "mesh.bluetooth", qos: .userInitiated)
  private let bleQueueKey = DispatchSpecificKey<Void>()

  // Application state tracking (thread-safe)
  #if os(iOS)
  private var isAppActive: Bool = true  // Assume active initially
  #endif
  
  // MARK - Core State (3 Essential Collections)
  
  // 1. Consolidated Peripheral Tracking
  private struct PeripheralState {
      let peripheral: CBPeripheral
      var characteristic: CBCharacteristic?
      var peerID: PeerID?
      var isConnecting: Bool = false
      var isConnected: Bool = false
      var lastConnectionAttempt: Date? = nil
  }
  
  private var peripherals: [String: PeripheralState] = [:]  // UUID -> PeripheralState
  private var peerToPeripheralUUID: [PeerID: String] = [:]  // PeerID -> Peripheral UUID
  private var recentConnectTimeouts: [String: Date] = [:] // Peripheral UUID -> last timeout
  
  // 2. BLE Centrals (when acting as peripheral)
  private var subscribedCentrals: [CBCentral] = []
  private var centralToPeerID: [String: PeerID] = [:]  // Central UUID -> Peer ID mapping
  // Accumulate long write chunks per central until a full frame decodes
  private var pendingWriteBuffers: [String: Data] = [:]
  
  // 3. Peer Information (single source of truth)
  private struct PeerInfo {
      let peerID: PeerID
      var nickname: String
      var isConnected: Bool
      var noisePublicKey: Data?
      var signingPublicKey: Data?
      var isVerifiedNickname: Bool
      var lastSeen: Date
  }
  private var peers: [PeerID: PeerInfo] = [:]
  private var currentPeerIDs: [PeerID] {
      Array(peers.keys)
  }

  // MARK: - Core BLE Objects
  private var centralManager: CBCentralManager?
  private var peripheralManager: CBPeripheralManager?
  private var characteristic: CBMutableCharacteristic?
  private let rssiThreshold: Int = -90
  
  let peripheralWriteObserver: (Data) -> Void
  let notifyObserver: (Data) -> Void
  
  init(writeObserver: @escaping (Data) -> Void, notifyObserver: @escaping (Data) -> Void) {
    self.peripheralWriteObserver = writeObserver
    self.notifyObserver = notifyObserver
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
  }
  
  deinit {
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
  
  func broadcastPacket(packet: Data) {
    let peripheralStates = snapshotPeripheralStates()
    let connectedPeripheralIds: [String] = peripheralStates
      .filter { $0.isConnected }
      .map { $0.peripheral.identifier.uuidString }
    
    let subscribedCentrals: [CBCentral]
    if let _ = characteristic {
      let (centrals, _) = snapshotSubscribedCentrals()
      subscribedCentrals = centrals
    } else {
      subscribedCentrals = []
    }
    
    print("Connected Peripherals: \(connectedPeripheralIds)")
    print("Subscribed Centrals: \(subscribedCentrals.map { $0.identifier.uuidString })")
    
    // writes to selected connected peripherals
    for s in peripheralStates where s.isConnected {
      let pid = s.peripheral.identifier.uuidString
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
      let targets = subscribedCentrals
      if !targets.isEmpty {
        _ = peripheralManager?.updateValue(packet, for: ch, onSubscribedCentrals: targets)
      }
    }
  }
  
  // MARK: Link capability snapshots (thread-safe via bleQueue)
  
  private func snapshotPeripheralStates() -> [PeripheralState] {
      if DispatchQueue.getSpecific(key: bleQueueKey) != nil {
          return Array(peripherals.values)
      } else {
          return bleQueue.sync { Array(peripherals.values) }
      }
  }
  private func snapshotSubscribedCentrals() -> ([CBCentral], [String: PeerID]) {
      if DispatchQueue.getSpecific(key: bleQueueKey) != nil {
          return (self.subscribedCentrals, self.centralToPeerID)
      } else {
          return bleQueue.sync { (self.subscribedCentrals, self.centralToPeerID) }
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
        peerID: nil,
        isConnecting: true,
        isConnected: false,
        lastConnectionAttempt: Date(),
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
          peerID: nil,
          isConnecting: false,
          isConnected: true,
          lastConnectionAttempt: nil,
        )
      }
      
      // reset backoff state to success
      recentConnectTimeouts.removeValue(forKey: peripheralId)
      
      print("✅ Connected: \(peripheral.name ?? "Unknown") [\(peripheralId)]")
      
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
      
      // find the peer id if we have it
      let peerId = peripherals[peripheralId]?.peerID
      
      // if disconnect carried an error (often timeout), apply short backoff to avoid thrash
      if error != nil {
        recentConnectTimeouts[peripheralId] = Date()
      }
      
      // clean up references
      peripherals.removeValue(forKey: peripheralId)
      
      // Clean up peer mappings
      if let peerId {
        peerToPeripheralUUID.removeValue(forKey: peerId)
      }
      
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
        let peerID = existing?.peerID
        let wasConnecting = existing?.isConnecting ?? false
        let wasConnected = existing?.isConnected ?? false
          
        let restoredState = PeripheralState(
          peripheral: peripheral,
          characteristic: characteristic,
          peerID: peerID,
          isConnecting: wasConnecting || peripheral.state == .connecting,
          isConnected: wasConnected || peripheral.state == .connected,
          lastConnectionAttempt: existing?.lastConnectionAttempt,
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
        
        // Track subscribed centrals
        // Can now send notifications to this central
      subscribedCentrals.append(central)
      
      // TODO: send announce?
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        print("ℹ️ Central unsubscribed: \(central.identifier.uuidString) from characteristic: \(characteristic.uuid)")
        
        // Remove from tracked centrals
      subscribedCentrals.removeAll { $0.identifier == central.identifier }
      
      // Ensure we're still advertising for other devices to find us
      if peripheral.isAdvertising == false {
        peripheral.startAdvertising(buildAdvertisementData())
      }
      
      // find and disconnect the peer associated with this central
      let centralUUID = central.identifier.uuidString
      
      if let peerId = centralToPeerID[centralUUID] {
        // mark peer as not connected; retain for reachability
        collectionsQueue.sync(flags: .barrier) {
          if var info = peers[peerId] {
            info.isConnected = false
            peers[peerId] = info
          }
        }
        
        // clean up mappings
        centralToPeerID.removeValue(forKey: centralUUID)
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
        // sortt by offset ascending
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
        
        pendingWriteBuffers[centralUUID] = combined
        
        // send combined back to react native layer
        peripheralWriteObserver(combined)
        
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
        
        // Discovering BLE characteristics
        peripheral.discoverCharacteristics([BleManager.characteristicUUID], for: service)
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
          peerID: nil,
          isConnecting: false,
          isConnected: peripheral.state == .connected,
          lastConnectionAttempt: nil,
      )
      
      peripherals[peripheralUUID] = state
      
      self.notifyObserver(data)
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



