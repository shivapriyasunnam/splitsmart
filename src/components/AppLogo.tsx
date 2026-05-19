import React from 'react';
import {Image, ImageStyle, StyleProp} from 'react-native';

const logoSource = require('../assets/splitsmartfinal.png');

interface AppLogoProps {
  /** Height of the logo in pixels. Defaults to 120. */
  size?: number;
  style?: StyleProp<ImageStyle>;
}

const AppLogo: React.FC<AppLogoProps> = ({size = 180, style}) => {
  return (
    <Image
      source={logoSource}
      style={[{width: size, height: size, resizeMode: 'contain'}, style]}
    />
  );
};

export default AppLogo;
