import React from 'react';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

type OrderStatus = string;

interface OrderStatusBadgeProps {
  status: OrderStatus;
  size?: 'small' | 'medium';
}

const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: colors.warning.light, color: colors.warning.dark },
  pending_dispatch: { label: 'Order placed', bg: colors.warning.light, color: colors.warning.dark },
  confirmed: { label: 'Confirmed', bg: colors.info.light, color: colors.info.dark },
  store_accepted: { label: 'Accepted', bg: colors.info.light, color: colors.info.dark },
  preparing: { label: 'Preparing', bg: colors.info.light, color: colors.info.dark },
  ready_for_pickup: { label: 'Ready for pickup', bg: colors.success.light, color: colors.success.dark },
  delivery_assigned: { label: 'Rider assigned', bg: colors.secondary[50], color: colors.secondary[700] },
  picked_up: { label: 'Picked up', bg: colors.success.light, color: colors.success.dark },
  in_transit: { label: 'On the way', bg: colors.secondary[50], color: colors.secondary[700] },
  out_for_delivery: { label: 'On the way', bg: colors.secondary[50], color: colors.secondary[700] },
  delivered: { label: 'Delivered', bg: colors.success.light, color: colors.success.dark },
  completed: { label: 'Completed', bg: colors.success.light, color: colors.success.dark },
  cancelled: { label: 'Cancelled', bg: colors.error.light, color: colors.error.dark },
  rejected: { label: 'Rejected', bg: colors.error.light, color: colors.error.dark },
  refunded: { label: 'Refunded', bg: colors.gray[200], color: colors.gray[700] },
};

const BadgeContainer = styled.View<{ bg: string; size: string }>`
  background-color: ${props => props.bg};
  padding-horizontal: ${props => (props.size === 'small' ? spacing.sm : spacing.md)}px;
  padding-vertical: ${props => (props.size === 'small' ? 2 : spacing.xs)}px;
  border-radius: ${borderRadius.sm}px;
  align-self: flex-start;
`;

const BadgeText = styled.Text<{ color: string; size: string }>`
  ${props => (props.size === 'small' ? typography.caption : typography.label)}
  color: ${props => props.color};
  font-weight: 600;
`;

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, size = 'medium' }) => {
  const config = statusConfig[String(status)] ?? {
    label: String(status || 'Unknown').replace(/_/g, ' '),
    bg: colors.gray[100],
    color: colors.gray[700],
  };
  return (
    <BadgeContainer bg={config.bg} size={size}>
      <BadgeText color={config.color} size={size}>{config.label}</BadgeText>
    </BadgeContainer>
  );
};

export default OrderStatusBadge;
