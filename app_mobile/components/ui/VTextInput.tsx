import React, { useState, useEffect, forwardRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface Props extends Omit<TextInputProps, 'value'> {
  value?: string;
}

export const VTextInput = forwardRef<TextInput, Props>(function VTextInput(
  { value, onChangeText, ...props }: Props,
  ref
) {
  const [internalValue, setInternalValue] = useState(value ?? '');

  useEffect(() => {
    if (value !== undefined && value !== internalValue) {
      setInternalValue(value);
    }
  }, [value]);

  return (
    <TextInput
      ref={ref}
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
});
