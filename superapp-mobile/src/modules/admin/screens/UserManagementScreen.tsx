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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { adminService, AdminUser, PartnerStatus } from '@services/admin.service';

type FilterTab = 'pending_approval' | 'active' | 'suspended' | 'all';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'all', label: 'All' },
];

const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  store: 'Store',
  restaurant: 'Restaurant',
  delivery: 'Delivery',
  cab_driver: 'Cab Driver',
  salon: 'Salon',
  admin: 'Admin',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_approval: { bg: colors.warning.light, text: colors.warning.dark },
  active: { bg: colors.success.light, text: colors.success.dark },
  suspended: { bg: colors.error.light, text: colors.error.dark },
  rejected: { bg: colors.gray[100], text: colors.gray[600] },
};

const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

interface UserCardProps {
  user: AdminUser;
  onApprove: (user: AdminUser) => void;
  onReject: (user: AdminUser) => void;
  onSuspend: (user: AdminUser) => void;
}

const UserCard: React.FC<UserCardProps> = ({
  user,
  onApprove,
  onReject,
  onSuspend,
}) => {
  const statusColor = STATUS_COLORS[user.status] ?? STATUS_COLORS.rejected;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(user.name ?? user.phone).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{user.name ?? '—'}</Text>
          <Text style={styles.cardPhone}>{user.phone}</Text>
          <Text style={styles.cardDate}>Joined {formatDate(user.created_at)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>
            {user.status === 'pending_approval' ? 'Pending' : user.status.charAt(0).toUpperCase() + user.status.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.roleTag}>
          <Text style={styles.roleTagText}>
            {ROLE_LABELS[user.role] ?? user.role}
          </Text>
        </View>
        {user.profile?.store_name && (
          <View style={styles.profileDetailRow}>
            <Ionicons name="storefront-outline" size={12} color={colors.text.secondary} />
            <Text style={styles.profileDetail}>{user.profile.store_name}</Text>
          </View>
        )}
        {user.profile?.restaurant_name && (
          <View style={styles.profileDetailRow}>
            <Ionicons name="restaurant-outline" size={12} color={colors.text.secondary} />
            <Text style={styles.profileDetail}>{user.profile.restaurant_name}</Text>
          </View>
        )}
        {user.profile?.vehicle_type && (
          <View style={styles.profileDetailRow}>
            <Ionicons name="bicycle-outline" size={12} color={colors.text.secondary} />
            <Text style={styles.profileDetail}>{user.profile.vehicle_type}</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      {user.status === 'pending_approval' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => onApprove(user)}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.success.dark} />
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(user)}
          >
            <Ionicons name="close-circle-outline" size={15} color={colors.error.dark} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
      {user.status === 'active' && user.role !== 'customer' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.suspendBtn]}
            onPress={() => onSuspend(user)}
          >
            <Ionicons name="pause-circle-outline" size={15} color={colors.warning.dark} />
            <Text style={styles.suspendBtnText}>Suspend</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const UserManagementScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FilterTab>('pending_approval');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [rejectModal, setRejectModal] = useState<{
    visible: boolean;
    user: AdminUser | null;
  }>({ visible: false, user: null });
  const [rejectReason, setRejectReason] = useState('');

  const fetchUsers = useCallback(
    async (tab: FilterTab = activeTab) => {
      try {
        const params =
          tab === 'all' ? {} : { status: tab as PartnerStatus };
        const result = await adminService.getUsers(params);
        setUsers(result.users);
        setTotal(result.total);
      } catch {
        Alert.alert('Error', 'Failed to load users. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab]
  );

  useEffect(() => {
    setLoading(true);
    fetchUsers(activeTab);
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers(activeTab);
  };

  const handleApprove = async (user: AdminUser) => {
    Alert.alert(
      'Approve Partner',
      `Approve ${user.name ?? user.phone} as ${ROLE_LABELS[user.role]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              await adminService.approveUser(user.id);
              setUsers((prev) =>
                prev.map((u) =>
                  u.id === user.id ? { ...u, status: 'active' } : u
                )
              );
              Alert.alert('Success', `${user.name ?? user.phone} has been approved.`);
            } catch {
              Alert.alert('Error', 'Failed to approve user. Please try again.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = (user: AdminUser) => {
    setRejectReason('');
    setRejectModal({ visible: true, user });
  };

  const submitReject = async () => {
    if (!rejectModal.user) return;
    if (!rejectReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a rejection reason.');
      return;
    }

    setActionLoading(true);
    try {
      await adminService.rejectUser(rejectModal.user.id, rejectReason.trim());
      setUsers((prev) =>
        prev.map((u) =>
          u.id === rejectModal.user?.id ? { ...u, status: 'rejected' } : u
        )
      );
      setRejectModal({ visible: false, user: null });
      Alert.alert('Done', 'User has been rejected.');
    } catch {
      Alert.alert('Error', 'Failed to reject user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (user: AdminUser) => {
    Alert.alert(
      'Suspend Account',
      `Suspend ${user.name ?? user.phone}? They will lose access to the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await adminService.suspendUser(user.id);
              setUsers((prev) =>
                prev.map((u) =>
                  u.id === user.id ? { ...u, status: 'suspended' } : u
                )
              );
            } catch {
              Alert.alert('Error', 'Failed to suspend user.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons
        name={activeTab === 'pending_approval' ? 'checkmark-done-circle-outline' : 'people-outline'}
        size={48}
        color={colors.gray[300]}
      />
      <Text style={styles.emptyTitle}>
        {activeTab === 'pending_approval'
          ? 'No pending approvals!'
          : 'No users found'}
      </Text>
      <Text style={styles.emptySubtitle}>Pull down to refresh</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <Text style={styles.subtitle}>{total} total</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary[500]}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onApprove={handleApprove}
              onReject={handleReject}
              onSuspend={handleSuspend}
            />
          )}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary[500]]}
              tintColor={colors.primary[500]}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Action overlay loading */}
      {actionLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}

      {/* Reject Reason Modal */}
      <Modal
        visible={rejectModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModal({ visible: false, user: null })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Application</Text>
            <Text style={styles.modalSubtitle}>
              Provide a reason for rejecting{' '}
              <Text style={styles.modalName}>
                {rejectModal.user?.name ?? rejectModal.user?.phone}
              </Text>
              . This will be shown to the user.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Documents incomplete, duplicate registration..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              placeholderTextColor={colors.gray[400]}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setRejectModal({ visible: false, user: null })}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalRejectBtn]}
                onPress={submitReject}
              >
                <Text style={styles.modalRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body2,
    color: colors.text.secondary,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    backgroundColor: colors.surface.sunken,
  },
  tabActive: {
    backgroundColor: colors.primary[500],
  },
  tabText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontFamily: fontFamily.semiBold,
  },
  tabTextActive: {
    color: colors.white,
  },
  loader: {
    marginTop: spacing.xxxxl,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    ...typography.h6,
    color: colors.primary[700],
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    ...typography.label,
    fontSize: 15,
    color: colors.text.primary,
  },
  cardPhone: {
    ...typography.body2,
    color: colors.text.secondary,
    marginTop: 1,
  },
  cardDate: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    ...typography.caption,
    fontSize: 11,
    fontFamily: fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  roleTag: {
    backgroundColor: colors.secondary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleTagText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.secondary[700],
    fontFamily: fontFamily.semiBold,
  },
  profileDetail: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  profileDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: {
    backgroundColor: colors.success.light,
    borderWidth: 1,
    borderColor: colors.success.DEFAULT,
  },
  approveBtnText: {
    ...typography.label,
    fontSize: 13,
    color: colors.success.dark,
  },
  rejectBtn: {
    backgroundColor: colors.error.light,
    borderWidth: 1,
    borderColor: colors.error.DEFAULT,
  },
  rejectBtnText: {
    ...typography.label,
    fontSize: 13,
    color: colors.error.dark,
  },
  suspendBtn: {
    backgroundColor: colors.warning.light,
    borderWidth: 1,
    borderColor: colors.warning.DEFAULT,
  },
  suspendBtnText: {
    ...typography.label,
    fontSize: 13,
    color: colors.warning.dark,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxxxl * 2,
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h5,
    color: colors.text.secondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body2,
    color: colors.text.muted,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.surface.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    ...typography.body2,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  modalName: {
    color: colors.text.primary,
    fontFamily: fontFamily.semiBold,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 12,
    padding: spacing.md,
    ...typography.body2,
    color: colors.text.primary,
    backgroundColor: colors.surface.sunken,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelBtn: {
    backgroundColor: colors.gray[100],
  },
  modalCancelText: {
    ...typography.label,
    fontSize: 15,
    color: colors.gray[700],
  },
  modalRejectBtn: {
    backgroundColor: colors.error.DEFAULT,
  },
  modalRejectText: {
    ...typography.button,
    fontSize: 15,
    color: colors.white,
  },
});

export default UserManagementScreen;
