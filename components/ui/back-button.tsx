import { Pressable, StyleSheet } from "react-native";
import { IconSymbol } from "./icon-symbol";

interface BackButtonProps {
  onPress?: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <Pressable style={styles.backButton} onPress={onPress}>
      <IconSymbol size={23} name="chevron.left" color={"white"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    backgroundColor: "rgba(90, 85, 85, 0.3)",
    borderRadius: "50%",
    padding: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderTopColor: "rgba(255, 255, 255, 0.4)",
    borderLeftColor: "rgba(255, 255, 255, 0.35)",
    shadowColor: "#fff",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
});
