import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import {Card, Badge, LoadingState} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getCombinedHistory, HistoryEntry} from '../../../db/repositories/historyRepository';
import {EntityType} from '../../../types';
import {formatAmount} from '../../balances/services/balanceService';

interface Props {
  /** Optional. When omitted, falls back to navigation.goBack(). */
  onBack?: () => void;
  /** React Navigation prop — present when rendered as a top-level route. */
  navigation?: {goBack: () => void};
}

/**
 * Sync History — unified feed of mutations from both this device (change_log)
 * and any partner who pushed changes via sync (inbound_audit_log). Newest
 * first, grouped roughly into local vs remote by the badge color.
 */
export const HistoryScreen: React.FC<Props> = ({onBack, navigation}) => {
  const goBack = onBack ?? (() => navigation?.goBack());
  const {profile, categories, myMember, partnerMember} = useAppStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const rows = await getCombinedHistory(200);
    setEntries(rows);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load(); } finally { setLoading(false); }
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const resolveCategoryName = (id?: string): string => {
    if (!id) return '—';
    const c = categories.find(x => x.id === id);
    return c?.name ?? 'Unknown category';
  };

  const resolveMemberName = (id?: string | null): string => {
    if (!id) return 'Partner';
    if (myMember?.id === id) return profile?.myName ?? 'You';
    if (partnerMember?.id === id) return profile?.partnerName ?? 'Partner';
    return 'Partner';
  };

  const actorName = (entry: HistoryEntry): string => {
    if (entry.source === 'local') return profile?.myName ?? 'You';
    return resolveMemberName(entry.sourceMemberId);
  };

  const describeEntry = (entry: HistoryEntry): {verb: string; subject: string} => {
    const r = entry.record ?? {};
    const isDelete = entry.operation === 'delete';
    const isArchive = !isDelete && !!r.is_archived && entry.entityType === 'category';
    const isSoftDelete = !isDelete && !!r.deleted_at;

    const verb = isDelete || isSoftDelete
      ? 'deleted'
      : isArchive
      ? 'archived'
      : 'updated';
    // "created" vs "updated" can't be distinguished from a single change_log
    // row without history — we just say "updated" for upserts. Good enough.

    return {verb, subject: describeSubject(entry.entityType, r, resolveCategoryName, resolveMemberName)};
  };

  const renderItem = ({item}: {item: HistoryEntry}) => {
    const {verb, subject} = describeEntry(item);
    const actor = actorName(item);
    const when = dayjs(item.occurredAt);
    const relative = when.fromNow();
    const absolute = when.format('D MMM HH:mm');

    return (
      <Card style={styles.card}>
        <Text style={styles.body}>
          <Text style={styles.actor}>{actor}</Text>{' '}
          <Text style={styles.verb}>{verb}</Text>{' '}
          <Text style={styles.subject}>{subject}</Text>
        </Text>
        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            <Badge
              label={item.source === 'local' ? 'You' : 'Partner'}
              color={item.source === 'local' ? Colors.primary : Colors.success}
            />
            <Text style={styles.timestamp}>{absolute}</Text>
          </View>
          <Text style={styles.timeText}>{relative}</Text>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sync History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => `${item.source}-${item.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No history yet. Edits you make and changes from your partner will appear here.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
};

function describeSubject(
  entityType: EntityType,
  record: any,
  resolveCategoryName: (id?: string) => string,
  resolveMemberName: (id?: string | null) => string,
): string {
  switch (entityType) {
    case 'expense': {
      const title = record?.title ?? 'expense';
      const amount = typeof record?.amount_minor === 'number'
        ? ` (${formatAmount(record.amount_minor, record.currency ?? 'CAD')})`
        : '';
      return `expense "${title}"${amount}`;
    }
    case 'budget': {
      const cat = resolveCategoryName(record?.category_id);
      const month = record?.month_key ?? '';
      const amount = typeof record?.amount_minor === 'number'
        ? ` to ${formatAmount(record.amount_minor, 'CAD')}`
        : '';
      return `budget for ${cat}${month ? ` (${month})` : ''}${amount}`;
    }
    case 'category':
      return `category "${record?.name ?? 'unnamed'}"`;
    case 'category_rule':
      return `auto-categorization rule${record?.pattern ? ` "${record.pattern}"` : ''}`;
    case 'settlement': {
      const amount = typeof record?.amount_minor === 'number'
        ? ` of ${formatAmount(record.amount_minor, 'CAD')}`
        : '';
      const from = resolveMemberName(record?.paid_by_member_id);
      const to = resolveMemberName(record?.received_by_member_id);
      return `settlement${amount} from ${from} to ${to}`;
    }
    case 'member':
      return `profile for ${record?.name ?? 'partner'}`;
    default:
      return entityType;
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {...Typography.h3},
  backLink: {color: Colors.primary, fontSize: 15},
  headerSpacer: {width: 70},
  list: {padding: Spacing.md, paddingBottom: Spacing.xl},
  card: {marginBottom: Spacing.sm, ...Shadows.sm},
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  body: {...Typography.body, fontSize: 13, lineHeight: 18},
  actor: {fontWeight: '600', color: Colors.text},
  verb: {color: Colors.textMuted},
  subject: {color: Colors.text},
  timeText: {...Typography.caption, fontSize: 10, color: Colors.textMuted},
  timestamp: {...Typography.caption, fontSize: 10, color: Colors.textMuted},
  empty: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
});
