import { Tabs } from 'expo-router'
import { FontAwesome } from '@expo/vector-icons'
import { useAuth } from '../../../hooks/useAuth'
import { colors } from '../../../constants/theme'

type Role = 'seeker' | 'tasker'

const ALL_TABS: { name: string; label: string; icon: React.ComponentProps<typeof FontAwesome>['name']; roles: Role[] }[] = [
  { name: 'post',     label: 'Đăng việc',    icon: 'plus-circle', roles: ['seeker'] },
  { name: 'jobs',     label: 'Việc của tôi', icon: 'list',        roles: ['seeker'] },
  { name: 'board',    label: 'Bảng việc',    icon: 'map-marker',  roles: ['tasker'] },
  { name: 'active',   label: 'Đã nhận',      icon: 'briefcase',   roles: ['tasker'] },
  { name: 'history',  label: 'Lịch sử',      icon: 'file-text',   roles: ['seeker', 'tasker'] },
  { name: 'earnings', label: 'Thu nhập',     icon: 'money',       roles: ['tasker'] },
  { name: 'chat',     label: 'Tin nhắn',     icon: 'comments',    roles: ['seeker', 'tasker'] },
]

export default function TabLayout() {
  const { currentRole } = useAuth()
  const isSeeker = currentRole === 'seeker'
  const activeColor = isSeeker ? colors.orange : colors.teal

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: colors.grayMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.stoneBorder,
          paddingBottom: 10,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      {ALL_TABS.map(tab => {
        const isActive = tab.roles.includes(currentRole as Role)
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              href: isActive ? undefined : null,
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name={tab.icon} size={size || 18} color={color} />
              ),
            }}
          />
        )
      })}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  )
}
