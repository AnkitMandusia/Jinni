import { api } from '@services/api';

export type PaytmSession = {
  already_paid?: boolean;
  orderId: string;
  txnToken?: string;
  mid?: string;
  amount?: string;
  isStaging?: boolean;
  callbackUrl?: string;
};

type PaytmNativeSDK = {
  startTransaction: (
    orderId: string,
    mid: string,
    txnToken: string,
    amount: string,
    callbackUrl: string,
    isStaging: boolean,
    restrictAppInvoke: boolean,
    urlScheme?: string,
  ) => Promise<any>;
};

function getSDK(): PaytmNativeSDK {
  // Keep the dependency optional at JS bundle/type-check time; native builds must install it.
  // Package: paytm_allinone_react-native (official Paytm React Native bridge).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('paytm_allinone_react-native');
  return (mod.default || mod) as PaytmNativeSDK;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards against the "Input should be valid UUID..." error reaching the
 * checkout screen: if the just-created order didn't come back with a real
 * id (e.g. a network hiccup during order creation), fail fast here with a
 * clear message instead of sending "undefined"/"" to the backend.
 */
function assertValidOrderId(orderId: unknown): asserts orderId is string {
  if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
    throw new Error('Could not start payment: the order was not created correctly. Please go back and try again.');
  }
}

export async function initiatePaytm(orderId: string): Promise<PaytmSession> {
  assertValidOrderId(orderId);
  return api.post<PaytmSession>(`/payments/paytm/initiate/${orderId}`);
}

export async function verifyPaytm(orderId: string): Promise<{
  order_id: string;
  payment_status: string;
  gateway_status: string;
  txn_id?: string;
}> {
  assertValidOrderId(orderId);
  return api.post(`/payments/paytm/verify/${orderId}`);
}

/**
 * Opens Paytm's native All-in-One checkout. Paytm handles UPI intent/app switching;
 * the backend remains authoritative through verifyPaytm().
 */
export async function startPaytmPayment(session: PaytmSession): Promise<any> {
  if (!session.txnToken || !session.mid || !session.amount) {
    throw new Error('Paytm payment session is incomplete');
  }
  return getSDK().startTransaction(
    session.orderId,
    session.mid,
    session.txnToken,
    session.amount,
    session.callbackUrl || '',
    Boolean(session.isStaging),
    false,
    `paytm${session.mid}`,
  );
}
