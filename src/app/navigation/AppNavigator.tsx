import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FontAwesome from 'react-native-vector-icons/FontAwesome5';
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
        options={{headerShown: false}}
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
        headerShadowVisible: false,
      }}>
      <ExpensesStack.Screen
        name="ExpensesList"
        component={ExpensesScreen}
        options={{headerShown: false}}
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
        tabBarIcon: ({color, size}) => (
            <FontAwesome name="home" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesNavigator}
        options={{
          headerShown: false,
        tabBarIcon: ({color, size}) => (
            <FontAwesome name="credit-card" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Balances"
        component={BalancesScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({color, size}) => (
            <FontAwesome name="balance-scale-left" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({color, size}) => (
            <FontAwesome name="wallet" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({color, size}) => (
            <FontAwesome name="chart-bar" size={size - 2} color={color} />
          ),
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
});

