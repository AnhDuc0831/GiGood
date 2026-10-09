import { Redirect } from 'expo-router'
import { useAuth } from '../../../hooks/useAuth'

export default function TabsIndex() {
  const { currentRole } = useAuth()
  
  if (currentRole === 'tasker') {
    return <Redirect href="/(app)/(tabs)/board" />
  }
  
  return <Redirect href="/(app)/(tabs)/post" />
}
