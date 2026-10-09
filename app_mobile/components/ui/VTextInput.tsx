import React, { useState, useEffect } from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface Props extends Omit<TextInputProps, 'value'> {
  value?: string;
}

export function VTextInput({ value, onChangeText, ...props }: Props) {
  const [internalValue, setInternalValue] = useState(value ?? '');

  useEffect(() => {
    if (value !== undefined && value !== internalValue) {
      setInternalValue(value);
    }
  }, [value]);

  return (
    <TextInput
      {...props}
      value={internalValue}
      onChangeText={(text) => {
        setInternalValue(text);
        if (onChangeText) {
          onChangeText(text);
        }
      }}
    />
  );
}
