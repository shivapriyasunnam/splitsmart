import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Member} from '../../types';
import {writeChangeLogInTx, getNextChangeLogSequence} from './changeLogRepository';

export async function getMembers(): Promise<Member[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM members ORDER BY role ASC',
  );
  const items: Member[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

export async function getMemberById(id: string): Promise<Member | null> {
  const db = await getDB();
  const [res] = await db.executeSql('SELECT * FROM members WHERE id = ?', [id]);
  if (res.rows.length === 0) return null;
  return res.rows.item(0);
}

export async function upsertMember(member: Member): Promise<void> {
  const db = await getDB();
  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `INSERT INTO members (id, name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, updated_at = excluded.updated_at`,
      [member.id, member.name, member.role, member.created_at, member.updated_at],
    );
    writeChangeLogInTx(tx, 'member', member.id, 'upsert', member, seq);
  });
}

export async function seedMembersFromProfile(
  myName: string,
  myRole: 'A' | 'B',
  partnerName: string,
  myMemberId?: string,
  partnerMemberId?: string,
): Promise<{myMember: Member; partnerMember: Member}> {
  const now = dayjs().toISOString();
  const partnerRole: 'A' | 'B' = myRole === 'A' ? 'B' : 'A';

  const myMember: Member = {
    id: myMemberId ?? uuidv4(),
    name: myName,
    role: myRole,
    created_at: now,
    updated_at: now,
  };
  const partnerMember: Member = {
    id: partnerMemberId ?? uuidv4(),
    name: partnerName,
    role: partnerRole,
    created_at: now,
    updated_at: now,
  };

  await upsertMember(myMember);
  await upsertMember(partnerMember);
  return {myMember, partnerMember};
}
