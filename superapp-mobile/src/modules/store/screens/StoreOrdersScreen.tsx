import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  items: Array<{ product_name: string; quantity: number }>;
  created_at: string;
  delivery_address: {
    line1?: string;
    city?: string;
    pincode?: string;
  };
  customer_id: string;
  notes?: string | null;
}

interface DeclineTarget {
  orderId: string;
  orderNumber: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  pending_dispatch: { bg: '#FFF3E0', text: '#E65100', icon: 'time' },
  store_accepted: { bg: '#E3F2FD', text: '#1565C0', icon: 'checkmark-circle' },
  preparing: { bg: '#F3E5F5', text: '#6A1B9A', icon: 'restaurant' },
  ready_for_pickup: { bg: '#E8F5E9', text: '#2E7D32', icon: 'basket' },
  delivery_assigned: { bg: '#E0F7FA', text: '#00838F', icon: 'bicycle' },
  picked_up: { bg: '#E8F5E9', text: '#2E7D32', icon: 'walk' },
  in_transit: { bg: '#FFF8E1', text: '#F9A825', icon: 'navigate' },
  delivered: { bg: '#E8F5E9', text: '#1B5E20', icon: 'checkmark-done' },
  cancelled: { bg: '#FFEBEE', text: '#C62828', icon: 'close-circle' },
};

const STATUS_LABELS: Record<string, string> = {
  pending_dispatch: 'New Order',
  store_accepted: 'Accepted',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready',
  delivery_assigned: 'Delivery Assigned',
  picked_up: 'Picked Up',
  in_transit: 'On the Way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const StoreOrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<DeclineTarget | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const fetchOrders = async () => {
    try {
      let statusFilter: string | undefined;
      if (activeTab === 'active') {
        statusFilter = undefined; // Will show all for store
      } else if (activeTab === 'completed') {
        statusFilter = 'delivered';
      }
      
      const params = statusFilter ? `?status_filter=${statusFilter}` : '';
      const response = await api.get<{ items: Order[] }>(`/orders/my-orders${params}`);
      
      let filteredOrders = response.items || [];
      
      if (activeTab === 'active') {
        // Filter out delivered/cancelled for active tab
        filteredOrders = filteredOrders.filter(o => 
          !['delivered', 'cancelled', 'no_store_available'].includes(o.status)
        );
      }
      
      setOrders(filteredOrders);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [activeTab])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleAcceptOrder = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      await api.post(`/orders/${orderId}/accept`, {});
      fetchOrders();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Failed to accept order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleDeclineOrder = async () => {
    if (!declineTarget || !declineReason.trim()) return;
    setDeclining(true);
    try {
      await api.post(`/orders/${declineTarget.orderId}/decline`, { reason: declineReason.trim() });
      setDeclineTarget(null);
      setDeclineReason('');
      fetchOrders();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Failed to decline order');
    } finally {
      setDeclining(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      fetchOrders();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Failed to update status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getNextStatus = (currentStatus: string): { status: string; label: string } | null => {
    const flow: Record<string, { status: string; label: string }> = {
      store_accepted: { status: 'preparing', label: 'Start Preparing' },
      preparing: { status: 'ready_for_pickup', label: 'Mark Ready' },
      ready_for_pickup: { status: 'delivery_assigned', label: 'Assign Delivery' },
    };
    return flow[currentStatus] || null;
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const statusConfig = STATUS_COLORS[item.status] || STATUS_COLORS.pending_dispatch;
    const nextAction = getNextStatus(item.status);
    const isPending = item.status === 'pending_dispatch';
    
    return (
      <View style={styles.orderCard}>
        {/* Header */}
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>#{item.order_number}</Text>
            <Text style={styles.orderTime}>
              {new Date(item.created_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.text} />
            <Text style={[styles.statusText, { color: statusConfig.text }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.itemsContainer}>
          {item.items?.slice(0, 3).map((orderItem, idx) => (
            <Text key={idx} style={styles.itemText}>
              • {orderItem.product_name} x{orderItem.quantity}
            </Text>
          ))}
          {item.items && item.items.length > 3 && (
            <Text style={styles.moreItems}>+{item.items.length - 3} more items</Text>
          )}
        </View>

        {/* Address */}
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={14} color={colors.gray[500]} />
          <Text style={styles.addressText}>
            {item.delivery_address?.city || 'Unknown location'}
          </Text>
        </View>

        {/* Amount & Actions */}
        <View style={styles.footer}>
          <Text style={styles.amount}>{formatPrice(item.total_amount)}</Text>
          
          {updatingOrderId === item.id ? (
            <ActivityIndicator size="small" color={colors.primary[500]} />
          ) : isPending ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => {
                  setDeclineTarget({ orderId: item.id, orderNumber: item.order_number });
                  setDeclineReason('');
                }}
              >
                <Text style={styles.rejectText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => handleAcceptOrder(item.id)}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : nextAction ? (
            <TouchableOpacity 
              style={styles.nextBtn}
              onPress={() => handleUpdateStatus(item.id, nextAction.status)}
            >
              <Text style={styles.nextBtnText}>{nextAction.label}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Decline Order Modal */}
      <Modal
        visible={!!declineTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setDeclineTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.declineSheet}>
            <Text style={styles.declineTitle}>Decline Order #{declineTarget?.orderNumber}</Text>
            <Text style={styles.declineSubtitle}>
              Write a note for the customer explaining why the order is being declined.
              This will be visible in their order history.
            </Text>
            <TextInput
              style={styles.declineInput}
              placeholder="e.g. The item you ordered is currently out of stock. Please create a new order without it."
              placeholderTextColor={colors.gray[400]}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{declineReason.length}/500</Text>
            <View style={styles.declineBtns}>
              <TouchableOpacity
                style={styles.cancelDeclineBtn}
                onPress={() => setDeclineTarget(null)}
                disabled={declining}
              >
                <Text style={styles.cancelDeclineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeclineBtn, (!declineReason.trim() || declining) && styles.disabledBtn]}
                onPress={handleDeclineOrder}
                disabled={!declineReason.trim() || declining}
              >
                <Text style={styles.confirmDeclineText}>
                  {declining ? 'Declining…' : 'Decline Order'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['active', 'completed', 'all'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={styles.loader} />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={64} color={colors.gray[300]} />
              <Text style={styles.emptyText}>No orders found</Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'active' 
                  ? 'New orders will appear here' 
                  : 'Completed orders will appear here'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  title: { fontSize: 24, fontFamily: fontFamily.bold, color: colors.gray[900] },
  tabs: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
  },
  activeTab: { backgroundColor: colors.primary[500] },
  tabText: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[600] },
  activeTabText: { color: colors.white },
  list: { padding: spacing.md },
  loader: { flex: 1, marginTop: 100 },
  orderCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderNumber: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.gray[900] },
  orderTime: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  statusText: { fontSize: 11, fontFamily: fontFamily.semiBold },
  itemsContainer: { marginBottom: spacing.md },
  itemText: { fontSize: 13, color: colors.gray[700], marginBottom: 2 },
  moreItems: { fontSize: 12, color: colors.gray[500], fontStyle: 'italic' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  addressText: { fontSize: 12, color: colors.gray[500] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingTop: spacing.md,
  },
  amount: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900] },
  actionButtons: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: colors.success.DEFAULT },
  rejectBtn: { backgroundColor: colors.gray[200] },
  acceptText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: 13 },
  rejectText: { color: colors.gray[700], fontFamily: fontFamily.semiBold, fontSize: 13 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  nextBtnText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: 13 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: { fontSize: 16, fontFamily: fontFamily.semiBold, color: colors.gray[600], marginTop: spacing.md },
  emptySubtext: { fontSize: 13, color: colors.gray[500], marginTop: spacing.xs },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  declineSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 36,
  },
  declineTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900], marginBottom: spacing.sm },
  declineSubtitle: {
    fontSize: 13,
    color: colors.gray[500],
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  declineInput: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.gray[800],
    minHeight: 100,
    backgroundColor: colors.gray[50],
  },
  charCount: { fontSize: 11, color: colors.gray[400], textAlign: 'right', marginTop: spacing.xs, marginBottom: spacing.lg },
  declineBtns: { flexDirection: 'row', gap: spacing.md },
  cancelDeclineBtn: {
    flex: 0.4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  cancelDeclineText: { color: colors.gray[600], fontFamily: fontFamily.bold, fontSize: 15 },
  confirmDeclineBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.error.DEFAULT,
  },
  confirmDeclineText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  disabledBtn: { opacity: 0.5 },
});

export default StoreOrdersScreen;
