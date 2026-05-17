import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors, Typography} from '../theme';

import {HomeScreen} from '../../features/home/screens/HomeScreen';
import {ExpensesScreen} from '../../features/expenses/screens/ExpensesScreen';
import {AddEditExpenseScreen} from '../../features/expenses/screens/AddEditExpenseScreen';
import {BalancesScreen} from '../../features/balances/screens/BalancesScreen';
import {BudgetsScreen} from '../../features/budgets/screens/BudgetsScreen';
import {InsightsScreen} from '../../features/insights/screens/InsightsScreen';
import {SettingsScreen} from '../../features/settings/screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const ExpensesStack = createNativeStackNavigator();

function HomeNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: Colors.surface},
        headerTitleStyle: Typography.h3,
        headerTintColor: Colors.primary,
      }}>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{headerShown: false}}
      />
      <HomeStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{title: 'Settings'}}
      />
      <HomeStack.Screen
        name="AddExpense"
        component={AddEditExpenseScreen}
        options={{title: 'Add Expense', headerStyle: {backgroundColor: Colors.surface}, headerTitleStyle: Typography.h3, headerTintColor: Colors.primary}}
      />
    </HomeStack.Navigator>
  );
}

function ExpensesNavigator() {
  return (
    <ExpensesStack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: Colors.surface},
        headerTitleStyle: Typography.h3,
        headerTintColor: Colors.primary,
      }}>
      <ExpensesStack.Screen
        name="ExpensesList"
        component={ExpensesScreen}
        options={{title: 'Expenses'}}
      />
      <ExpensesStack.Screen
        name="AddExpense"
        component={AddEditExpenseScreen}
        options={{title: 'Add Expense'}}
      />
      <ExpensesStack.Screen
        name="EditExpense"
        component={AddEditExpenseScreen}
        options={{title: 'Edit Expense'}}
      />
    </ExpensesStack.Navigator>
  );
}

interface TabIconProps {
  focused: boolean;
  icon: string;
}

function TabIcon({focused, icon}: TabIconProps) {
  return (
    <Text
      style={[
        styles.tabIcon,
        {color: focused ? Colors.primary : Colors.textMuted},
      ]}>
      {icon}
    </Text>
  );
}

export function AppNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: [
          styles.tabBar,
          {height: 60 + insets.bottom, paddingBottom: insets.bottom + 4},
        ],
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: {backgroundColor: Colors.surface},
        headerTitleStyle: Typography.h3,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({focused}) => <TabIcon focused={focused} icon="🏠" />,
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({focused}) => <TabIcon focused={focused} icon="💳" />,
        }}
      />
      <Tab.Screen
        name="Balances"
        component={BalancesScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon focused={focused} icon="⚖️" />,
          title: 'Balances',
        }}
      />
      <Tab.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon focused={focused} icon="🎯" />,
          title: 'Budgets',
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon focused={focused} icon="📊" />,
          title: 'Insights',
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    paddingTop: 4,
  },
  tabLabel: {
    ...Typography.caption,
    fontSize: 10,
  },
  tabIcon: {
    fontSize: 20,
  },
});

