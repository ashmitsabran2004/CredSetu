import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DarkTheme, NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient, Loan, Summary } from './src/api';
import { gradients, theme } from './src/theme';

type Routes = { Login: undefined; Home: undefined; AddEntry: undefined };
const Stack = createNativeStackNavigator<Routes>();
const c = theme.colors;

function GradientButton({ title, onPress, disabled = false, icon }: { title: string; onPress: () => void; disabled?: boolean; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.buttonPress, pressed && styles.pressed, disabled && styles.disabled]}>
    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButton}>
      {icon ? <MaterialCommunityIcons name={icon} size={theme.fontSize.medium} color={c.white} /> : null}
      <Text style={styles.primaryButtonText}>{title}</Text>
    </LinearGradient>
  </Pressable>;
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState(''); const [code, setCode] = useState('');
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submitPhone = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return setError('Enter a phone number with country code, such as +14155552671.');
    setBusy(true); setError('');
    try { await apiClient.requestOtp(phone); setSent(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const submitCode = async () => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the server log.');
    setBusy(true); setError('');
    try { const result = await apiClient.verifyOtp(phone, code); await apiClient.saveToken(result.token); onLogin(result.token); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView style={styles.loginLayout} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.loginContent}>
        <LinearGradient colors={gradients.accent} style={styles.logoMark}><MaterialCommunityIcons name="wallet-outline" size={theme.fontSize.title} color={c.white} /></LinearGradient>
        <Text style={styles.wordmark}>MiniLedger</Text>
        <Text style={styles.tagline}>Track money you lend, effortlessly.</Text>
        <View style={styles.loginForm}>
          <Text style={styles.label}>{sent ? 'Verification code' : 'Phone number'}</Text>
          {!sent ? <View style={styles.inputWrap}>
            <View style={styles.countryPrefix}><Text style={styles.prefixText}>＋</Text></View>
            <TextInput style={styles.input} keyboardType="phone-pad" autoCapitalize="none" value={phone} onChangeText={setPhone} placeholder="+1 415 555 2671" placeholderTextColor={c.subtle} editable={!sent} />
          </View> : <>
            <Text style={styles.otpHint}>Enter the 6-digit code sent to {phone}</Text>
            <TextInput accessibilityLabel="6-digit code" style={styles.otpInput} keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="• • • • • •" placeholderTextColor={c.subtle} />
          </>}
          {sent ? <View style={styles.linkRow}>
            <Pressable onPress={() => { setSent(false); setCode(''); setError(''); }} hitSlop={theme.spacing.sm}><Text style={styles.textLink}>‹  Back</Text></Pressable>
            <Pressable onPress={submitPhone} hitSlop={theme.spacing.sm}><Text style={styles.textLink}>Resend code</Text></Pressable>
          </View> : null}
          <View style={styles.formButton}><GradientButton title={sent ? 'Verify and log in' : 'Send verification code'} onPress={sent ? submitCode : submitPhone} disabled={busy} icon={sent ? 'arrow-right' : 'message-text-outline'} /></View>
          {busy ? <ActivityIndicator color={c.cyan} style={styles.loader} /> : null}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
      <Text style={styles.loginFootnote}>A clearer picture of every dollar.</Text>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function StatusPill({ kind, label }: { kind: 'repaid' | 'due' | 'overdue' | 'active'; label: string }) {
  const colors = kind === 'repaid' ? [c.green, c.greenSurface] : kind === 'due' ? [c.amber, c.amberSurface] : kind === 'overdue' ? [c.red, c.redSurface] : [c.muted, c.surfaceRaised];
  const icon = kind === 'repaid' ? 'check-circle' : kind === 'due' ? 'clock-outline' : kind === 'overdue' ? 'alert-circle-outline' : 'circle-small';
  return <View style={[styles.statusPill, { backgroundColor: colors[1] }]}><MaterialCommunityIcons name={icon} size={theme.fontSize.small} color={colors[0]} /><Text style={[styles.statusText, { color: colors[0] }]}>{label}</Text></View>;
}

function loanStatus(item: Loan): { kind: 'repaid' | 'due' | 'overdue' | 'active'; label: string } {
  if (item.repaid_at) return { kind: 'repaid', label: 'Repaid' };
  if (item.is_overdue) return { kind: 'overdue', label: 'Overdue' };
  const due = new Date(`${item.due_date.slice(0, 10)}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  return daysUntilDue >= 0 && daysUntilDue <= 7 ? { kind: 'due', label: 'Due soon' } : { kind: 'active', label: 'On track' };
}

function HomeScreen({ token, goAdd, logout }: { token: string; goAdd: () => void; logout: () => void }) {
  const [loans, setLoans] = useState<Loan[]>([]); const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { const [loanRows, totals] = await Promise.all([apiClient.loans(token), apiClient.summary(token)]); setLoans(loanRows); setSummary(totals); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(React.useCallback(() => { void load(); }, [token]));
  const markRepaid = async (id: number) => {
    try { await apiClient.repay(token, id); await load(true); } catch (e) { Alert.alert('Could not update loan', (e as Error).message); }
  };
  const Header = <View>
    <View style={styles.topBar}><View><Text style={styles.eyebrow}>YOUR OVERVIEW</Text><Text style={styles.screenTitle}>Good to see you</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={logout} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="logout" size={theme.fontSize.medium} color={c.muted} /></Pressable>
    </View>
    <LinearGradient colors={gradients.deep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
      <View style={styles.summaryTop}><Text style={styles.summaryLabel}>TOTAL LENT</Text><View style={styles.summaryIcon}><MaterialCommunityIcons name="chart-areaspline" size={theme.fontSize.medium} color={c.cyan} /></View></View>
      <Text style={styles.totalAmount}>${summary?.total_lent ?? '—'}</Text>
      <View style={styles.summaryDivider} />
      <View style={styles.statsRow}>
        <View style={styles.statBlock}><View style={styles.statHeading}><MaterialCommunityIcons name="check-circle-outline" size={theme.fontSize.body} color={c.green} /><Text style={styles.statLabel}>REPAID</Text></View><Text style={styles.statAmount}>${summary?.total_repaid ?? '—'}</Text></View>
        <View style={styles.statSeparator} />
        <View style={styles.statBlock}><View style={styles.statHeading}><MaterialCommunityIcons name="alert-circle-outline" size={theme.fontSize.body} color={c.amber} /><Text style={styles.statLabel}>OVERDUE</Text></View><Text style={styles.statAmount}>${summary?.overdue_amount ?? '—'}</Text></View>
      </View>
    </LinearGradient>
    <View style={styles.sectionHeading}><View style={styles.entriesTitleWrap}><Text style={styles.sectionTitle}>Entries</Text><Text style={styles.countBadge}>{loans.length}</Text></View></View>
  </View>;

  return <SafeAreaView style={styles.screen}>
    {loading ? <View style={styles.loadingState}><ActivityIndicator size="large" color={c.cyan} /><Text style={styles.muted}>Loading your entries…</Text></View> : error ? <View style={styles.errorState}><MaterialCommunityIcons name="wifi-alert" size={theme.fontSize.wordmark} color={c.red} /><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.textLink}>Try again</Text></Pressable></View> : <FlatList data={loans} keyExtractor={(item) => String(item.id)} ListHeaderComponent={Header} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.cyan} colors={[c.violet, c.cyan]} />}
      ListEmptyComponent={<View style={styles.emptyState}><View style={styles.emptyIcon}><MaterialCommunityIcons name="receipt-text-outline" size={theme.fontSize.title} color={c.cyan} /></View><Text style={styles.emptyTitle}>Nothing to track yet</Text><Text style={styles.muted}>Add your first entry and keep every loan in view.</Text></View>}
      renderItem={({ item }) => {
        const status = loanStatus(item);
        return <View style={[styles.loanCard, status.kind === 'overdue' && styles.overdueCard, item.repaid_at && styles.repaidCard]}>
          <View style={styles.loanMain}><LinearGradient colors={gradients.avatar} style={styles.avatar}><Text style={styles.avatarText}>{item.friend_name.trim().charAt(0).toUpperCase()}</Text></LinearGradient>
            <View style={styles.friendInfo}><Text style={[styles.friendName, item.repaid_at && styles.dimmed]} numberOfLines={1}>{item.friend_name}</Text><Text style={styles.dueDate}>Due {new Date(`${item.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text></View>
            <Text style={[styles.loanAmount, item.repaid_at && styles.dimmed]}>${item.amount}</Text>
          </View>
          <View style={styles.loanFooter}><View style={styles.badgeGroup}><StatusPill kind={status.kind} label={status.label} />{item.receipt_url ? <MaterialCommunityIcons name="paperclip" size={theme.fontSize.body} color={c.subtle} /> : null}</View>
            {!item.repaid_at ? <Pressable accessibilityRole="button" onPress={() => markRepaid(item.id)} style={({ pressed }) => [styles.repayButton, pressed && styles.pressed]}><MaterialCommunityIcons name="check" size={theme.fontSize.body} color={c.green} /><Text style={styles.repayText}>Mark repaid</Text></Pressable> : <MaterialCommunityIcons name="check-decagram" size={theme.fontSize.medium} color={c.green} />}
          </View>
        </View>;
      }} />}
    <Pressable accessibilityRole="button" accessibilityLabel="Add entry" onPress={goAdd} style={({ pressed }) => [styles.fabWrap, pressed && styles.fabPressed]}><LinearGradient colors={gradients.accent} style={styles.fab}><MaterialCommunityIcons name="plus" size={theme.fontSize.title} color={c.white} /></LinearGradient></Pressable>
  </SafeAreaView>;
}

function AddEntryScreen({ token, onSaved, back }: { token: string; onSaved: () => void; back: () => void }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date()); const [showPicker, setShowPicker] = useState(false);
  const [photoUri, setPhotoUri] = useState<string>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo library permission is needed to attach a receipt.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };
  const save = async () => {
    const normalized = amount.trim();
    if (!name.trim()) return setError('Enter your friend’s name.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || !/[1-9]/.test(normalized.replace('.', ''))) return setError('Enter a positive amount with up to 2 decimal places.');
    setBusy(true); setError('');
    try { await apiClient.addLoan(token, { friend_name: name.trim(), amount: normalized, due_date: dueDate.toISOString().slice(0, 10), photoUri }); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
    <View style={styles.addHeader}><Text style={styles.eyebrow}>NEW TRANSACTION</Text><Text style={styles.screenTitle}>Add an entry</Text><Text style={styles.muted}>Capture the details so nothing slips through.</Text></View>
    <Text style={styles.label}>Friend’s name</Text><View style={styles.inputWrap}><MaterialCommunityIcons name="account-outline" size={theme.fontSize.medium} color={c.subtle} /><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Taylor" placeholderTextColor={c.subtle} /></View>
    <Text style={styles.label}>Amount</Text><View style={styles.inputWrap}><Text style={styles.currencyPrefix}>$</Text><TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.subtle} /></View>
    <Text style={styles.label}>Due date</Text><Pressable accessibilityRole="button" onPress={() => setShowPicker(true)} style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}><MaterialCommunityIcons name="calendar-month-outline" size={theme.fontSize.medium} color={c.cyan} /><Text style={styles.dateText}>{dueDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text><MaterialCommunityIcons name="chevron-down" size={theme.fontSize.medium} color={c.muted} /></Pressable>
    {showPicker && <DateTimePicker value={dueDate} mode="date" minimumDate={new Date()} onChange={(_event, date) => { setShowPicker(false); if (date) setDueDate(date); }} />}
    <Text style={styles.label}>Receipt photo <Text style={styles.optional}>(optional)</Text></Text>
    <Pressable accessibilityRole="button" onPress={choosePhoto} style={({ pressed }) => [styles.photoBox, pressed && styles.pressed]}>
      {photoUri ? <><Image source={{ uri: photoUri }} style={styles.photoThumbnail} /><View style={styles.photoOverlay}><MaterialCommunityIcons name="camera-outline" size={theme.fontSize.medium} color={c.white} /><Text style={styles.photoOverlayText}>Change photo</Text></View></> : <><View style={styles.cameraIcon}><MaterialCommunityIcons name="camera-plus-outline" size={theme.fontSize.title} color={c.cyan} /></View><Text style={styles.photoTitle}>Add a receipt</Text><Text style={styles.muted}>Tap to choose a photo</Text></>}
    </Pressable>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {busy ? <View style={styles.saving}><ActivityIndicator color={c.cyan} /><Text style={styles.muted}>Saving entry…</Text></View> : null}
    <View style={styles.saveButton}><GradientButton title={busy ? 'Saving…' : 'Save entry'} onPress={save} disabled={busy} icon="check" /></View>
    <Pressable accessibilityRole="button" onPress={back} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null); const [checking, setChecking] = useState(true);
  useEffect(() => { void apiClient.getToken().then(setToken).finally(() => setChecking(false)); }, []);
  if (checking) return <SafeAreaView style={[styles.screen, styles.centered]}><ActivityIndicator size="large" color={c.cyan} /></SafeAreaView>;
  return <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, primary: c.cyan, background: c.background, card: c.background, text: c.text, border: c.border, notification: c.violet } }}><StatusBar style="light" />{token ? <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: c.background }, headerTintColor: c.text, headerTitleStyle: styles.navTitle, headerShadowVisible: false, contentStyle: { backgroundColor: c.background }, animation: 'slide_from_right' }}>
    <Stack.Screen name="Home" options={{ title: 'MiniLedger', headerShown: false }}>{({ navigation }) => <HomeScreen token={token} goAdd={() => navigation.navigate('AddEntry')} logout={async () => { await apiClient.removeToken(); setToken(null); }} />}</Stack.Screen>
    <Stack.Screen name="AddEntry" options={{ title: 'New entry', headerBackTitle: 'Home' }}>{({ navigation }) => <AddEntryScreen token={token} onSaved={() => navigation.goBack()} back={() => navigation.goBack()} />}</Stack.Screen>
  </Stack.Navigator> : <LoginScreen onLogin={setToken} />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background, paddingHorizontal: theme.spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loginLayout: { flex: 1, justifyContent: 'center' },
  loginContent: { alignItems: 'center', width: '100%' },
  logoMark: { width: theme.spacing.huge + theme.spacing.xs, height: theme.spacing.huge + theme.spacing.xs, borderRadius: theme.radius.large, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.lg },
  wordmark: { color: c.text, fontSize: theme.fontSize.wordmark, fontWeight: '800', letterSpacing: -theme.spacing.xxs },
  tagline: { color: c.muted, fontSize: theme.fontSize.body, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xxl, textAlign: 'center' },
  loginForm: { width: '100%', maxWidth: theme.spacing.contentMax },
  label: { color: c.muted, fontSize: theme.fontSize.small, fontWeight: '700', letterSpacing: theme.spacing.xxs / 2, marginBottom: theme.spacing.xs, marginTop: theme.spacing.lg },
  inputWrap: { minHeight: theme.spacing.huge, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: theme.radius.medium, paddingHorizontal: theme.spacing.md },
  countryPrefix: { width: theme.spacing.xxl, height: theme.spacing.xxl, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.small, backgroundColor: c.surfaceRaised },
  prefixText: { color: c.cyan, fontSize: theme.fontSize.medium, fontWeight: '700' },
  input: { flex: 1, color: c.text, paddingVertical: theme.spacing.sm, fontSize: theme.fontSize.input },
  otpHint: { color: c.muted, fontSize: theme.fontSize.body, marginBottom: theme.spacing.sm },
  otpInput: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: theme.radius.medium, minHeight: theme.spacing.huge, paddingHorizontal: theme.spacing.md, color: c.text, textAlign: 'center', fontSize: theme.fontSize.title, fontWeight: '700', letterSpacing: theme.spacing.sm },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.md },
  textLink: { color: c.cyan, fontSize: theme.fontSize.body, fontWeight: '600' },
  formButton: { marginTop: theme.spacing.xl },
  buttonPress: { borderRadius: theme.radius.medium, overflow: 'hidden' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
  primaryButton: { minHeight: theme.spacing.huge, borderRadius: theme.radius.medium, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: c.white, fontSize: theme.fontSize.input, fontWeight: '700' },
  loader: { marginTop: theme.spacing.md },
  loginFootnote: { color: c.subtle, fontSize: theme.fontSize.small, textAlign: 'center', paddingBottom: theme.spacing.md },
  error: { color: c.red, fontSize: theme.fontSize.body, marginTop: theme.spacing.md, lineHeight: theme.fontSize.body * 1.5 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  eyebrow: { color: c.cyan, fontSize: theme.fontSize.micro, fontWeight: '800', letterSpacing: theme.spacing.xxs },
  screenTitle: { color: c.text, fontSize: theme.fontSize.title, fontWeight: '800', marginTop: theme.spacing.xxs },
  iconButton: { width: theme.spacing.huge, height: theme.spacing.huge, borderRadius: theme.radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderRadius: theme.radius.large, padding: theme.spacing.lg, borderWidth: 1, borderColor: c.borderBright, marginBottom: theme.spacing.xl },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: c.textOnAccent, fontSize: theme.fontSize.small, fontWeight: '700', letterSpacing: theme.spacing.xxs },
  summaryIcon: { width: theme.spacing.xxl, height: theme.spacing.xxl, borderRadius: theme.radius.small, backgroundColor: c.accentSurface, alignItems: 'center', justifyContent: 'center' },
  totalAmount: { color: c.white, fontSize: theme.fontSize.amount, fontWeight: '800', letterSpacing: -theme.spacing.xxs, marginTop: theme.spacing.sm },
  summaryDivider: { height: 1, backgroundColor: c.divider, marginVertical: theme.spacing.md },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBlock: { flex: 1, gap: theme.spacing.xs },
  statHeading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  statLabel: { color: c.textOnAccentMuted, fontSize: theme.fontSize.micro, fontWeight: '800', letterSpacing: theme.spacing.xxs },
  statAmount: { color: c.text, fontSize: theme.fontSize.metric, fontWeight: '700' },
  statSeparator: { width: 1, height: theme.spacing.xxl, backgroundColor: c.divider, marginHorizontal: theme.spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  entriesTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  sectionTitle: { color: c.text, fontSize: theme.fontSize.medium, fontWeight: '800' },
  countBadge: { color: c.muted, backgroundColor: c.surfaceRaised, overflow: 'hidden', paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.xxs, borderRadius: theme.radius.pill, fontSize: theme.fontSize.small, fontWeight: '700' },
  listContent: { paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.huge + theme.spacing.xl, flexGrow: 1 },
  loanCard: { backgroundColor: c.surface, borderRadius: theme.radius.medium, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: c.border },
  overdueCard: { borderColor: c.overdueBorder, backgroundColor: c.overdueSurface },
  repaidCard: { opacity: 0.72 },
  loanMain: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  avatar: { width: theme.spacing.huge, height: theme.spacing.huge, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.white, fontWeight: '800', fontSize: theme.fontSize.medium },
  friendInfo: { flex: 1 },
  friendName: { color: c.text, fontWeight: '700', fontSize: theme.fontSize.input },
  dueDate: { color: c.muted, fontSize: theme.fontSize.small, marginTop: theme.spacing.xxs },
  loanAmount: { color: c.text, fontWeight: '800', fontSize: theme.fontSize.medium },
  loanFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.md },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  statusText: { fontSize: theme.fontSize.small, fontWeight: '700' },
  repayButton: { minHeight: theme.spacing.xxl, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: c.greenBorder, backgroundColor: c.greenSurface, paddingHorizontal: theme.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
  repayText: { color: c.green, fontSize: theme.fontSize.small, fontWeight: '700' },
  dimmed: { color: c.muted },
  emptyState: { alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.huge },
  emptyIcon: { width: theme.spacing.huge + theme.spacing.sm, height: theme.spacing.huge + theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.md },
  emptyTitle: { color: c.text, fontSize: theme.fontSize.medium, fontWeight: '700', marginBottom: theme.spacing.xs },
  muted: { color: c.muted, fontSize: theme.fontSize.body, lineHeight: theme.fontSize.body * 1.45, textAlign: 'center' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  fabWrap: { position: 'absolute', right: theme.spacing.lg, bottom: theme.spacing.xl, borderRadius: theme.radius.pill, overflow: 'hidden', elevation: 6 },
  fabPressed: { transform: [{ scale: 0.94 }] },
  fab: { width: theme.spacing.huge + theme.spacing.sm, height: theme.spacing.huge + theme.spacing.sm, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  formScroll: { paddingBottom: theme.spacing.xxl },
  addHeader: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  currencyPrefix: { color: c.cyan, fontSize: theme.fontSize.title, fontWeight: '700' },
  amountInput: { flex: 1, color: c.text, paddingVertical: theme.spacing.sm, fontSize: theme.fontSize.title, fontWeight: '700' },
  dateField: { minHeight: theme.spacing.huge, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: theme.radius.medium },
  dateText: { flex: 1, color: c.text, fontSize: theme.fontSize.input, fontWeight: '600' },
  optional: { color: c.subtle, fontSize: theme.fontSize.small, fontWeight: '400' },
  photoBox: { minHeight: theme.spacing.huge * 2 + theme.spacing.sm, borderRadius: theme.radius.medium, borderWidth: 1, borderColor: c.dashedBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: c.formSurface },
  cameraIcon: { width: theme.spacing.xxl + theme.spacing.xs, height: theme.spacing.xxl + theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xs },
  photoTitle: { color: c.text, fontSize: theme.fontSize.body, fontWeight: '700', marginBottom: theme.spacing.xxs },
  photoThumbnail: { width: '100%', height: theme.spacing.huge * 2 + theme.spacing.sm, resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, backgroundColor: c.photoOverlay, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  photoOverlayText: { color: c.white, fontSize: theme.fontSize.small, fontWeight: '700' },
  saving: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  saveButton: { marginTop: theme.spacing.xl },
  cancelButton: { minHeight: theme.spacing.huge, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xs },
  cancelText: { color: c.muted, fontSize: theme.fontSize.body, fontWeight: '600' },
  navTitle: { color: c.text, fontSize: theme.fontSize.medium, fontWeight: '700' },
});
