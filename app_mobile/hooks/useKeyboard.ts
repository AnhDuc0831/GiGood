import { useEffect, useState } from 'react'
import { Keyboard, KeyboardEvent, Platform } from 'react-native'

export function useKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame'

    const onShow = (e: KeyboardEvent) => {
      const h = e?.endCoordinates?.height || 0
      setKeyboardHeight(h)
      setIsKeyboardVisible(h > 0)
    }

    const onHide = () => {
      setKeyboardHeight(0)
      setIsKeyboardVisible(false)
    }

    const showSub = Keyboard.addListener(showEvent, onShow)
    const hideSub = Keyboard.addListener(hideEvent, onHide)
    const changeSub = Keyboard.addListener(changeEvent, onShow)

    return () => {
      showSub.remove()
      hideSub.remove()
      changeSub.remove()
    }
  }, [])

  return { keyboardHeight, isKeyboardVisible }
}
