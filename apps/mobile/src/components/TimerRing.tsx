import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  progress: number; // 0–1
  color: string;
  size: number;
  strokeWidth?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TimerRing({ progress, color, size, strokeWidth = 6 }: Props) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const animatedOffset = useRef(new Animated.Value(circumference * (1 - progress))).current;

  useEffect(() => {
    Animated.timing(animatedOffset, {
      toValue: circumference * (1 - progress),
      duration: 950,
      useNativeDriver: false,
    }).start();
  }, [progress, circumference]);

  // Jump to 0 offset when progress resets to 1 (new phase)
  useEffect(() => {
    if (progress >= 1) {
      animatedOffset.setValue(0);
    }
  }, [progress >= 1]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        {/* Track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#16161f"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="butt"
        />
      </Svg>
    </View>
  );
}
