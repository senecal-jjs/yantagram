import { ReactNode, useRef } from "react";
import { Animated, Pressable, ViewStyle } from "react-native";

interface BounceButtonProps {
  onPress: () => void;
  children: ReactNode;
  style?: ViewStyle;
}

export const BounceButton = ({
  onPress,
  children,
  style,
}: BounceButtonProps) => {
  // Create an animated value for the scale, initialized to 1
  const scaleValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 1.3, // Scale down slightly when pressed
      useNativeDriver: true, // Use the native driver for performance
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1.0, // Scale back to original size when released
      friction: 3, // Controls the spring effect's bounciness
      tension: 40, // Controls the spring effect's speed
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = {
    transform: [{ scale: scaleValue }],
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
};
