import mongoose from 'mongoose';
import { env } from '../config/env';
import { UserModel } from '../modules/users/user.model';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { BudgetModel } from '../modules/budgets/budget.model';
import { RecurringModel } from '../modules/recurring/recurring.model';
import { PersonModel } from '../modules/people/person.model';
import { MoneyOwedModel } from '../modules/moneyOwed/moneyOwed.model';
import { TransactionModel } from '../modules/transactions/transaction.model';
import { NotificationModel } from '../modules/notifications/notification.model';
import { createMoneyOwed } from '../modules/moneyOwed/moneyOwed.service';
import {
  evaluateBudgetAlertsForUser,
  evaluateRecurringRemindersForUser,
  evaluatePeopleRemindersForUser,
  evaluateUnusualSpendingForUser,
  evaluateMonthlySummaryForUser,
  runAllAlertsForUser,
  isInQuietHours,
  applyPreviewPrivacy,
} from '../modules/notifications/alertEngine';
import * as notifService from '../modules/notifications/notification.service';

async function runTests() {
  console.log('=== Starting Phase D.4: Notifications, Reminders & Financial Alerts Test Suite ===\n');
  await mongoose.connect(env.MONGODB_URI);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Clean up any test artifacts from prior runs
  await UserModel.deleteMany({ email: { $regex: '^phase_d4_' } });
  await NotificationModel.deleteMany({ title: { $regex: 'Phase D4' } });

  // -------------------------------------------------------------
  // Test Setup: Users, Accounts, Categories
  // -------------------------------------------------------------
  const userA = await UserModel.create({
    name: 'User A D4',
    email: `phase_d4_userA_${Date.now()}@example.com`,
    passwordHash: 'hash123',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    notificationPrefs: {
      budgetAlerts: true,
      recurringAlerts: true,
      peopleAlerts: true,
      spendingAlerts: true,
      monthlySummaryAlerts: true,
      previewMode: 'detailed',
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    },
  });
  const userAId = String(userA._id);

  const userB = await UserModel.create({
    name: 'User B D4',
    email: `phase_d4_userB_${Date.now()}@example.com`,
    passwordHash: 'hash123',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    notificationPrefs: {
      budgetAlerts: true,
      recurringAlerts: true,
      peopleAlerts: true,
      spendingAlerts: true,
      monthlySummaryAlerts: true,
      previewMode: 'private',
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
    },
  });
  const userBId = String(userB._id);

  // Accounts
  const accountA = await AccountModel.create({
    userId: userA._id,
    name: 'HDFC Savings',
    type: 'bank',
    balance: 5000000, // ₹50,000
    currency: 'INR',
  });
  const accountB = await AccountModel.create({
    userId: userB._id,
    name: 'SBI Savings',
    type: 'bank',
    balance: 3000000, // ₹30,000
    currency: 'INR',
  });

  // Categories
  const catFood = await CategoryModel.create({
    userId: userA._id,
    name: 'Dining Out',
    group: 'Food',
    color: '#FF5722',
    icon: 'restaurant',
  });
  await CategoryModel.create({
    userId: userA._id,
    name: 'Groceries',
    group: 'Food',
    color: '#4CAF50',
    icon: 'cart',
  });

  // People
  const personRohan = await PersonModel.create({
    userId: userA._id,
    name: 'Rohan Sharma',
  });

  console.log('--- Section 1: Budget Alert Tests (80% warning, 100% exceeded, deduplication) ---');

  // Budget of ₹10,000 (1000000 paise) on Dining Out, warnAtPercent = 80
  await BudgetModel.create({
    userId: userA._id,
    scope: 'category',
    categoryId: catFood._id,
    amount: 1000000,
    warnAtPercent: 80,
    isActive: true,
  });

  // Initial spend: 0. Alerts count should be 0.
  let alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 0, '1.1 No budget alerts when spend is 0%');

  // Add ₹7,500 expense (75% -> below 80%)
  await TransactionModel.create({
    userId: userA._id,
    type: 'expense',
    amount: 750000,
    accountId: accountA._id,
    categoryId: catFood._id,
    description: 'Dinner party (75%)',
    date: new Date(),
  });
  alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 0, '1.2 No budget alert when spend is 75% (< 80%)');

  // Add ₹600 expense (now ₹8,100 -> 81% -> crosses 80% warning)
  await TransactionModel.create({
    userId: userA._id,
    type: 'expense',
    amount: 60000,
    accountId: accountA._id,
    categoryId: catFood._id,
    description: 'Cafe coffee (crosses 80%)',
    date: new Date(),
  });
  alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 1, '1.3 80% Warning alert generated when spend crosses 80%');

  const warningNotif = await NotificationModel.findOne({
    userId: userA._id,
    type: 'budget_warning',
  });
  assert(Boolean(warningNotif), '1.4 Warning notification persisted in database');
  assert(warningNotif?.title.includes('Dining Out') ?? false, '1.5 Warning notification contains category name');

  // Add another ₹500 expense (now ₹8,600 -> still in 80-100% bracket)
  await TransactionModel.create({
    userId: userA._id,
    type: 'expense',
    amount: 50000,
    accountId: accountA._id,
    categoryId: catFood._id,
    description: 'Snacks (86%)',
    date: new Date(),
  });
  alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 0, '1.6 Deduplication: Warning not regenerated on subsequent expense within 80-100%');

  // Add ₹1,500 expense (now ₹10,100 -> 101% -> crosses 100% exceeded)
  await TransactionModel.create({
    userId: userA._id,
    type: 'expense',
    amount: 150000,
    accountId: accountA._id,
    categoryId: catFood._id,
    description: 'Weekend dinner (exceeds budget)',
    date: new Date(),
  });
  alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 1, '1.7 100% Exceeded alert generated when spend crosses 100%');

  const exceededNotif = await NotificationModel.findOne({
    userId: userA._id,
    type: 'budget_exceeded',
  });
  assert(Boolean(exceededNotif), '1.8 Exceeded notification persisted in database');

  // Subsequent check: should be 0 because exceeded is already raised
  alertsRaised = await evaluateBudgetAlertsForUser(userAId);
  assert(alertsRaised === 0, '1.9 Deduplication: Exceeded alert not regenerated on repeat check');

  // User isolation: User B has 0 alerts
  const userBAlerts = await evaluateBudgetAlertsForUser(userBId);
  assert(userBAlerts === 0, '1.10 User B has 0 budget alerts (isolated from User A)');

  // Preference check: If budgetAlerts disabled, returns 0
  await UserModel.findByIdAndUpdate(userAId, { 'notificationPrefs.budgetAlerts': false });
  const disabledBudgetAlerts = await evaluateBudgetAlertsForUser(userAId);
  assert(disabledBudgetAlerts === 0, '1.11 When budgetAlerts preference is false, returns 0 alerts');
  await UserModel.findByIdAndUpdate(userAId, { 'notificationPrefs.budgetAlerts': true });

  console.log('\n--- Section 2: Recurring Payment Reminders (upcoming, due-today, deduplication) ---');

  const now = new Date();
  const in1Day = new Date(now.getTime() + 1 * 86400000);

  // 1. Rule due tomorrow (upcoming)
  await RecurringModel.create({
    userId: userA._id,
    name: 'Netflix Subscription',
    type: 'expense',
    amount: 64900, // ₹649
    accountId: accountA._id,
    unit: 'month',
    interval: 1,
    startDate: new Date(now.getTime() - 28 * 86400000),
    nextRunAt: in1Day,
    isActive: true,
    isPaused: false,
  });

  // 2. Rule due today
  await RecurringModel.create({
    userId: userA._id,
    name: 'Broadband Bill',
    type: 'expense',
    amount: 99900, // ₹999
    accountId: accountA._id,
    unit: 'month',
    interval: 1,
    startDate: new Date(now.getTime() - 30 * 86400000),
    nextRunAt: now,
    isActive: true,
    isPaused: false,
  });

  // 3. Paused rule due today (should NOT trigger)
  await RecurringModel.create({
    userId: userA._id,
    name: 'Gym Membership (Paused)',
    type: 'expense',
    amount: 250000,
    accountId: accountA._id,
    unit: 'month',
    interval: 1,
    startDate: new Date(now.getTime() - 30 * 86400000),
    nextRunAt: now,
    isActive: true,
    isPaused: true,
  });

  const recurringRaised = await evaluateRecurringRemindersForUser(userAId, now);
  assert(recurringRaised === 2, '2.1 Evaluates both upcoming and due-today recurring reminders (count = 2)');

  const upcomingNotif = await NotificationModel.findOne({
    userId: userA._id,
    type: 'recurring_upcoming',
  });
  const dueNotif = await NotificationModel.findOne({
    userId: userA._id,
    type: 'recurring_due',
  });
  const pausedNotif = await NotificationModel.findOne({
    userId: userA._id,
    title: { $regex: 'Gym' },
  });
  assert(Boolean(upcomingNotif), '2.2 Upcoming recurring reminder created');
  assert(Boolean(dueNotif), '2.3 Due-today recurring reminder created');
  assert(!pausedNotif, '2.4 Paused recurring rule did NOT create a reminder');

  // Deduplication check
  const recurringRaisedAgain = await evaluateRecurringRemindersForUser(userAId, now);
  assert(recurringRaisedAgain === 0, '2.5 Deduplication: Repeating recurring evaluation creates 0 duplicates');

  console.log('\n--- Section 3: People / Money Owed Reminders & Financial Invariants ---');

  // 1. Money owed to me (receivable) due tomorrow
  const owedUpcoming = await createMoneyOwed(userAId, {
    personId: String(personRohan._id),
    accountId: String(accountA._id),
    direction: 'owed_to_me',
    type: 'loan',
    purpose: 'Dinner bill split',
    amount: 200000, // ₹2,000
    dueDate: in1Day,
  });

  // 2. Money I owe (payable) due today
  await createMoneyOwed(userAId, {
    personId: String(personRohan._id),
    accountId: String(accountA._id),
    direction: 'i_owe',
    type: 'borrowed',
    purpose: 'Concert ticket share',
    amount: 150000, // ₹1,500
    dueDate: now,
  });

  // 3. Overdue debt (due 3 days ago)
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  await createMoneyOwed(userAId, {
    personId: String(personRohan._id),
    accountId: String(accountA._id),
    direction: 'i_owe',
    type: 'borrowed',
    purpose: 'Old trip advance',
    amount: 500000, // ₹5,000
    dueDate: threeDaysAgo,
  });

  // Capture accounting state before evaluating reminders
  const balanceBefore = (await AccountModel.findById(accountA._id))!.balance;
  const owedRemainingBefore = (await MoneyOwedModel.findById(owedUpcoming.id))!.remainingAmount;
  const txCountBefore = await TransactionModel.countDocuments({ userId: userA._id });

  const peopleRaised = await evaluatePeopleRemindersForUser(userAId, now);
  assert(peopleRaised === 3, '3.1 Generates upcoming, due-today, and overdue reminders for money owed (count = 3)');

  const peopleRaisedAgain = await evaluatePeopleRemindersForUser(userAId, now);
  assert(peopleRaisedAgain === 0, '3.2 Deduplication: People reminders deduplicated against existing notifications');

  // Core Financial Invariant Check: Reminders MUST NEVER modify accounting
  const balanceAfter = (await AccountModel.findById(accountA._id))!.balance;
  const owedRemainingAfter = (await MoneyOwedModel.findById(owedUpcoming.id))!.remainingAmount;
  const txCountAfter = await TransactionModel.countDocuments({ userId: userA._id });

  assert(balanceBefore === balanceAfter, '3.3 INVARIANT: Account balance is strictly unchanged after reminder generation');
  assert(owedRemainingBefore === owedRemainingAfter, '3.4 INVARIANT: Money owed remainingAmount is strictly unchanged');
  assert(txCountBefore === txCountAfter, '3.5 INVARIANT: Zero financial transactions created by reminder engine');

  console.log('\n--- Section 4: Privacy Modes (Private, Basic, Detailed) ---');

  const sampleTitle = 'Budget Alert: Dining Out';
  const sampleBody = 'You have used 85% of your ₹10,000 Dining Out budget (₹8,500 spent).';

  const detailedPreview = applyPreviewPrivacy(sampleTitle, sampleBody, 'detailed');
  assert(
    detailedPreview.title.includes('Dining Out') && detailedPreview.body.includes('₹8,500'),
    '4.1 Detailed mode preserves title and amount',
  );

  const basicPreview = applyPreviewPrivacy(sampleTitle, sampleBody, 'basic');
  assert(
    basicPreview.title.includes('Dining Out') && !basicPreview.body.includes('₹8,500'),
    '4.2 Basic mode keeps title context but hides financial details',
  );

  const privatePreview = applyPreviewPrivacy(sampleTitle, sampleBody, 'private');
  assert(
    privatePreview.title === 'Paisa' && privatePreview.body === 'You have a new financial reminder.',
    '4.3 Private mode replaces both title and body with generic text',
  );

  console.log('\n--- Section 5: Quiet Hours & Timezone (Asia/Kolkata) ---');

  // Quiet hours: 22:00 to 08:00
  // Test 11:30 PM (23:30) IST -> should be true
  const nightTime = new Date('2026-09-17T18:00:00.000Z'); // 18:00 UTC = 23:30 IST (+5:30)
  const isNightQuiet = isInQuietHours(nightTime, 'Asia/Kolkata', {
    enabled: true,
    start: '22:00',
    end: '08:00',
  });
  assert(isNightQuiet === true, '5.1 23:30 IST is recognized as quiet hours (between 22:00 and 08:00)');

  // Test 2:30 PM (14:30) IST -> should be false
  const dayTime = new Date('2026-09-17T09:00:00.000Z'); // 09:00 UTC = 14:30 IST
  const isDayQuiet = isInQuietHours(dayTime, 'Asia/Kolkata', {
    enabled: true,
    start: '22:00',
    end: '08:00',
  });
  assert(isDayQuiet === false, '5.2 14:30 IST is recognized as outside quiet hours');

  // Disabled quiet hours
  const isDisabledQuiet = isInQuietHours(nightTime, 'Asia/Kolkata', {
    enabled: false,
    start: '22:00',
    end: '08:00',
  });
  assert(isDisabledQuiet === false, '5.3 When quietHours is disabled, returns false even at night');

  console.log('\n--- Section 6: Device Token Management ---');

  // 1. Register device for User A
  const dev1 = await notifService.registerDevice(
    userAId,
    'ExponentPushToken[device_token_userA_1]',
    'ios',
    'device_1',
  );
  assert(dev1.registered === true, '6.1 Successfully registered iOS device token for User A');

  // 2. Register same token again (idempotent upsert)
  const dev1Repeat = await notifService.registerDevice(
    userAId,
    'ExponentPushToken[device_token_userA_1]',
    'ios',
    'device_1_renamed',
  );
  assert(dev1Repeat.registered === true, '6.2 Idempotently updated existing device token');

  // 3. Register second device for User A (Android)
  await notifService.registerDevice(
    userAId,
    'ExponentPushToken[device_token_userA_2]',
    'android',
    'device_2',
  );

  // 4. Register device for User B
  await notifService.registerDevice(
    userBId,
    'ExponentPushToken[device_token_userB_1]',
    'android',
    'device_userB_1',
  );

  // 5. User isolation on device tokens
  const userADevices = await notifService.listDevices(userAId);
  assert(userADevices.length === 2, '6.3 User A has exactly 2 active devices');
  const userBDevices = await notifService.listDevices(userBId);
  assert(userBDevices.length === 1, '6.4 User B has exactly 1 active device');
  assert(Boolean(userBDevices[0]?.token.includes('userB')), '6.5 User B cannot see User A devices');

  // 6. Delete device
  await notifService.deleteDevice(userAId, 'ExponentPushToken[device_token_userA_1]');
  const userADevicesAfter = await notifService.listDevices(userAId);
  assert(userADevicesAfter.length === 1, '6.6 Successfully deleted device token');

  console.log('\n--- Section 7: Idempotency, Unusual Spending & Monthly Summary ---');

  const unusualCount = await evaluateUnusualSpendingForUser(userAId);
  assert(typeof unusualCount === 'number', '7.1 evaluateUnusualSpendingForUser executes cleanly');

  const monthlyCount = await evaluateMonthlySummaryForUser(userAId);
  assert(typeof monthlyCount === 'number', '7.2 evaluateMonthlySummaryForUser executes cleanly');

  // Run alert engine on User A
  const run1 = await runAllAlertsForUser(userAId);
  assert(typeof run1.total === 'number', '7.3 runAllAlertsForUser returns total count');

  // Run alert engine a second time immediately
  const run2 = await runAllAlertsForUser(userAId);
  assert(run2.total === 0, '7.4 Idempotency: Second consecutive alert engine run generates 0 duplicate notifications');

  // Run alert engine a third time
  const run3 = await runAllAlertsForUser(userAId);
  assert(run3.total === 0, '7.5 Idempotency: Third consecutive alert engine run generates 0 duplicate notifications');

  console.log('\n--- Section 8: Notification Service CRUD & Unread Count ---');

  const initialUnread = await notifService.countUnread(userAId);
  assert(initialUnread > 0, `8.1 User A has unread notifications (${initialUnread})`);

  const notifList = await notifService.listNotifications(userAId, { page: 1, limit: 10, unreadOnly: false });
  assert(notifList.notifications.length > 0, '8.2 listNotifications returns items sorted by createdAt desc');

  const firstNotifId = notifList.notifications[0]?.id!;
  await notifService.markRead(userAId, firstNotifId);
  const unreadAfterOneRead = await notifService.countUnread(userAId);
  assert(unreadAfterOneRead === initialUnread - 1, '8.3 markRead decrements unread count by exactly 1');

  await notifService.markAllRead(userAId);
  const unreadAfterMarkAll = await notifService.countUnread(userAId);
  assert(unreadAfterMarkAll === 0, '8.4 markAllRead resets unread count to 0');

  // User B cannot access User A's notification
  let threwUnauthorized = false;
  try {
    await notifService.markRead(userBId, firstNotifId);
  } catch (err: any) {
    threwUnauthorized = true;
  }
  assert(threwUnauthorized, '8.5 Cross-user security: User B cannot mark User A notification as read');

  console.log('\n--- Section 9: Notification Preferences Management ---');

  const initialPrefs = await notifService.getNotificationPreferences(userAId);
  assert(initialPrefs.budgetAlerts === true, '9.1 getNotificationPreferences returns user preferences');

  const updatedPrefs = await notifService.updateNotificationPreferences(userAId, {
    budgetAlerts: false,
    previewMode: 'basic',
    quietHours: { enabled: true, start: '23:00', end: '07:00' },
  });
  assert(updatedPrefs.budgetAlerts === false, '9.2 Updated budgetAlerts preference to false');
  assert(updatedPrefs.previewMode === 'basic', '9.3 Updated previewMode to basic');
  assert(updatedPrefs.quietHours.start === '23:00', '9.4 Updated quietHours start time');

  console.log('\n--- Section 10: Final Accounting Invariant Check ---');

  const finalBalanceA = (await AccountModel.findById(accountA._id))!.balance;
  const finalBalanceB = (await AccountModel.findById(accountB._id))!.balance;
  const finalTransactions = await TransactionModel.find({ userId: userA._id });

  assert(finalBalanceA === balanceBefore, '10.1 INVARIANT: Account A balance completely preserved across all D.4 tests');
  assert(finalBalanceB === 3000000, '10.2 INVARIANT: Account B balance completely preserved');
  assert(finalTransactions.length === txCountBefore, '10.3 INVARIANT: No extra transactions or phantom writes occurred');

  console.log(`\n=== Phase D.4 Test Summary: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
