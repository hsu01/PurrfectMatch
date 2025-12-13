import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
// import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs initialRouteName="profile"
      screenOptions={({ route }) => ({
      tabBarActiveTintColor: '#f6f2e9',
      tabBarInactiveTintColor: '#c9bd9a',
      headerShown: true,
      tabBarButton: HapticTab,
      headerTitleAlign: "center",
      headerStyle: { backgroundColor: '#4b2e83' },
      headerTintColor: '#f6f2e9',
      headerTitleStyle: { fontWeight: '800', color: '#f6f2e9' },
      tabBarStyle: {
        backgroundColor: '#4b2e83',
        borderTopColor: '#b7a57a',
        height: 64,
        paddingBottom: 8,
        paddingTop: 8,
      },
      sceneContainerStyle: { backgroundColor: '#f6f2e9' },

      tabBarIcon: ({ color, focused }) => {
        if (route.name === "index") {
        return <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />;
        }
        if (route.name === "PlayDate") {
        return <Ionicons name={focused ? "calendar-clear" : "calendar-clear-outline"} size={24} color={color} />;
        }
        if (route.name === "places") {
        return <Ionicons name={focused ? "map" : "map-outline"} size={24} color={color} />;
        }
        if (route.name === "chat") {
        return <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={24} color={color} />;
        }
        if (route.name === "profile") {
        return <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />;
        }
        return null;
      }
      })}
    >
      <Tabs.Screen
      name="index"
      options={{
        title: 'Community',
      }}
      />

      <Tabs.Screen
      name="PlayDate"
      options={{
        title: 'PlayDate',
      }}
      />

      <Tabs.Screen
      name="places"
      options={{
        title: 'Places',
      }}
      />

      <Tabs.Screen
      name="chat"
      options={{
        title: 'Chat',
      }}
      />

      <Tabs.Screen
      name="profile"
      options={{
        title: 'profile',
      }}
      />
    </Tabs>
  );
}
