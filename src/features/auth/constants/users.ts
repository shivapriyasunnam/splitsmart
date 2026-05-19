import {MemberRole} from '../../../types';

// Shared passphrase used by both devices for BT sync encryption.
// Same value on both sides → same derived key → symmetric encryption works.
export const SHARED_PASSPHRASE = 'pri1402dha0208';

export interface HardcodedUser {
  username: string;
  password: string;
  displayName: string;
  /** Fixed UUID — same value on every device, forever. Eliminates UUID mismatch
   *  after Bluetooth sync where each device previously generated its own random IDs. */
  memberId: string;
  role: MemberRole;
}

export const HARDCODED_USERS: HardcodedUser[] = [
  {
    username: 'priya',
    password: 'pri1402',
    displayName: 'Priya',
    memberId: 'f47ac10b-58cc-4372-a567-000000000001',
    role: 'A',
  },
  {
    username: 'dhanush',
    password: 'dha0208',
    displayName: 'Dhanush',
    memberId: 'f47ac10b-58cc-4372-a567-000000000002',
    role: 'B',
  },
];

/** Returns the matching user or null. Username match is case-insensitive. */
export function findUser(username: string, password: string): HardcodedUser | null {
  return (
    HARDCODED_USERS.find(
      u => u.username === username.toLowerCase() && u.password === password,
    ) ?? null
  );
}
