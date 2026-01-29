import { DeliveryStats } from "@/repos/specs/message-delivery-repository";
import { DeliveryStatus, Message } from "@/types/global";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

export interface ChatBubbleProps {
  message: Message;
  contactPseudonym: string;
  showPseudonym: boolean;
  verificationKey: string;
  groupSize?: number; // total group members including self
  deliveryStats?: DeliveryStats; // for groups
  onDeliveryPress?: (messageId: string) => void; // callback when delivery label is pressed
}

// Xml strings for left and right curl svg
const curlRight = `<svg width="17" height="21" viewBox="0 0 17 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.8869 20.1846C11.6869 20.9846 6.55352 18.1212 4.88685 16.2879C6.60472 12.1914 -4.00107 2.24186 2.99893 2.24148C4.61754 2.24148 6 -1.9986 11.8869 1.1846C11.9081 2.47144 11.8869 6.92582 11.8869 7.6842C11.8869 18.1842 17.8869 19.5813 16.8869 20.1846Z" fill="#0B93F6"/>
</svg>
`;

const curlLeft = `<svg width="17" height="21" viewBox="0 0 17 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0.11315 20.1846C5.31315 20.9846 10.4465 18.1212 12.1132 16.2879C10.3953 12.1914 21.0011 2.24186 14.0011 2.24148C12.3825 2.24148 11 -1.9986 5.11315 1.1846C5.09194 2.47144 5.11315 6.92582 5.11315 7.6842C5.11315 18.1842 -0.88685 19.5813 0.11315 20.1846Z" fill="#545455ff"/>
</svg>
`;

/**
 * Get delivery status label text for sent messages
 */
const getDeliveryLabel = (
  status?: DeliveryStatus,
  groupSize?: number,
  deliveryStats?: DeliveryStats,
): string => {
  // For groups with more than 2 members (1 other person), show detailed stats
  if (groupSize && groupSize > 2 && deliveryStats && deliveryStats.total > 0) {
    if (deliveryStats.delivered === 0) {
      return "Sent";
    } else if (deliveryStats.delivered >= deliveryStats.total) {
      return "Delivered to all";
    } else {
      return `Delivered to ${deliveryStats.delivered}/${deliveryStats.total}`;
    }
  }

  // Simple 1:1 chat or fallback
  switch (status) {
    case DeliveryStatus.DELIVERED:
    case DeliveryStatus.READ:
      return "Delivered";
    case DeliveryStatus.SENT:
    case DeliveryStatus.SENDING:
    default:
      return "Sent";
  }
};

export const ChatBubble = ({
  message,
  contactPseudonym,
  showPseudonym,
  verificationKey,
  groupSize,
  deliveryStats,
  onDeliveryPress,
}: ChatBubbleProps) => {
  const isMyMessage = message.sender === verificationKey;
  const isGroup = groupSize && groupSize > 2;

  const deliveryLabel = getDeliveryLabel(
    message.deliveryStatus,
    groupSize,
    deliveryStats,
  );

  return (
    <View>
      {!isMyMessage && showPseudonym && (
        <Text style={styles.pseudonymText}>{contactPseudonym}</Text>
      )}
      {isMyMessage && (
        <Pressable
          onPress={() => {
            if (isGroup && onDeliveryPress) {
              onDeliveryPress(message.id);
            }
          }}
          disabled={!isGroup || !onDeliveryPress}
        >
          <Text
            style={[
              styles.deliveryLabel,
              isGroup && onDeliveryPress ? styles.deliveryLabelClickable : null,
            ]}
          >
            {deliveryLabel}
          </Text>
        </Pressable>
      )}
      <View
        style={[
          styles.bubble,
          isMyMessage ? styles.myMessage : styles.theirMessage,
        ]}
      >
        <Text
          style={isMyMessage ? styles.myMessageText : styles.theirMessageText}
        >
          {message.contents}
        </Text>
      </View>
      {!isMyMessage ? (
        <SvgXml xml={curlLeft} width={20} height={20} style={styles.curlLeft} />
      ) : (
        <SvgXml
          xml={curlRight}
          width={20}
          height={20}
          style={styles.curlRight}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    maxWidth: "80%",
  },
  myMessage: {
    marginRight: 6,
    backgroundColor: "#0B93F6",
    alignSelf: "flex-end",
    borderBottomRightRadius: 5,
  },
  myMessageText: {
    color: "white",
    fontSize: 16,
    fontWeight: 500,
  },
  pseudonymText: {
    color: "#7e7e82ff",
    marginLeft: 10,
    marginBottom: 2,
    fontSize: 12,
  },
  theirMessage: {
    marginLeft: 6,
    backgroundColor: "#545455ff",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 5,
  },
  theirMessageText: {
    color: "white",
    fontSize: 16,
    fontWeight: 500,
  },
  curlRight: {
    position: "absolute",
    bottom: 5,
    right: 0,
  },
  curlLeft: {
    position: "absolute",
    bottom: 5,
    left: 0,
  },
  deliveryLabel: {
    color: "#7e7e82ff",
    fontSize: 12,
    textAlign: "right",
    marginRight: 10,
    marginBottom: 2,
  },
  deliveryLabelClickable: {
    textDecorationLine: "underline",
  },
});
