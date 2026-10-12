import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing } from '@theme/spacing';

type DocKey = 'privacy' | 'terms' | 'refund';

const DOCS: Record<DocKey, { title: string; updated: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: 12 October 2026',
    sections: [
      { heading: '1. Information we collect', body: 'We collect information you provide directly (name, phone number, email, delivery addresses) and information generated through your use of the app (order history, location when you place an order, device and app diagnostics).' },
      { heading: '2. How we use your information', body: 'We use your information to process orders, enable delivery, provide customer support, send order and account updates, and improve the app. We do not sell your personal data to third parties.' },
      { heading: '3. Sharing with partners', body: 'To fulfil your order, relevant details (name, phone, delivery address) are shared with the restaurant/store and delivery partner assigned to that order. Payment details are processed directly by our payment gateway partner and are not stored on our servers.' },
      { heading: '4. Location data', body: 'We use your location to show nearby stores/restaurants, calculate delivery fees and estimated times, and to enable live order tracking. You can control location permissions from your device settings.' },
      { heading: '5. Data retention', body: 'We retain your account and order data for as long as your account is active, and as required by law (e.g. for tax and dispute-resolution purposes) after that.' },
      { heading: '6. Your choices', body: 'You can edit or delete your saved addresses at any time from Profile > Saved Addresses, update your name/email from Profile > Edit Profile, and request account deletion from Profile > Settings.' },
      { heading: '7. Contact us', body: 'For privacy questions or requests, reach us via Profile > Help & Support, or email support@ourapp.com.' },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    updated: 'Last updated: 12 October 2026',
    sections: [
      { heading: '1. Using the app', body: 'By creating an account and using this app, you agree to these terms. You must be able to enter into a legally binding contract to use the app.' },
      { heading: '2. Orders', body: 'All orders are subject to acceptance by the restaurant/store. Prices, availability and delivery times shown in the app are estimates and may change. We reserve the right to cancel an order where the partner is unable to fulfil it, with a full refund.' },
      { heading: '3. Payments', body: 'Payments can be made via Cash on Delivery or UPI/online payment through our payment gateway partner. Online payments are authenticated and verified server-side before an order is confirmed as paid.' },
      { heading: '4. Cancellations & refunds', body: 'Orders can usually be cancelled free of charge before the partner accepts them. See our Refund Policy for details on how refunds are processed.' },
      { heading: '5. User conduct', body: 'You agree not to misuse the app, attempt to interfere with its functioning, or provide false information. Accounts found to violate these terms may be suspended.' },
      { heading: '6. Limitation of liability', body: "The app is provided on an 'as is' basis. We are not liable for delays or issues caused by third-party restaurants, stores, delivery partners, or events outside our reasonable control." },
      { heading: '7. Changes to these terms', body: 'We may update these terms from time to time. Continued use of the app after changes means you accept the updated terms.' },
    ],
  },
  refund: {
    title: 'Refund Policy',
    updated: 'Last updated: 12 October 2026',
    sections: [
      { heading: '1. Order cancellations', body: 'If you cancel an order before it is accepted by the restaurant/store, you will receive a full refund. Cancellations after acceptance/preparation may not be eligible for a full refund.' },
      { heading: '2. Failed/duplicate payments', body: "If money was deducted but your order was not placed, or you were charged twice, report it via Profile > Help & Support > Payment issue. We will verify with our payment partner and refund the duplicate/failed amount." },
      { heading: '3. Quality or missing items', body: 'If you receive the wrong item, missing items, or items with a quality issue, report it within a reasonable time via Profile > Help & Support > Order issue, and our team will review and process a refund or replacement as appropriate.' },
      { heading: '4. Refund timelines', body: 'Approved refunds to UPI/cards are typically processed within 3-5 business days, though your bank may take longer to reflect the credit.' },
      { heading: '5. How to request a refund', body: 'All refund requests go through Profile > Help & Support > Report an issue, so our team can review order details and respond with an update.' },
    ],
  },
};

export const LegalScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const docKey: DocKey = (route.params?.doc as DocKey) || 'privacy';
  const doc = DOCS[docKey] || DOCS.privacy;

  useLayoutEffect(() => {
    navigation.setOptions({ title: doc.title });
  }, [navigation, doc.title]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={styles.updated}>{doc.updated}</Text>
        {doc.sections.map((s) => (
          <View key={s.heading} style={{ marginBottom: spacing.lg }}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
        <Text style={styles.footnote}>
          This is a summary for app display. For the full legal document, visit our website or contact support@ourapp.com.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  updated: { ...typography.caption, color: colors.gray[400], marginBottom: spacing.lg },
  heading: { ...typography.body1, fontFamily: fontFamily.bold, color: colors.gray[900], marginBottom: spacing.xs },
  body: { ...typography.body2, color: colors.gray[600], lineHeight: 20 },
  footnote: { ...typography.caption, color: colors.gray[400], marginTop: spacing.md, fontStyle: 'italic' },
});

export default LegalScreen;
