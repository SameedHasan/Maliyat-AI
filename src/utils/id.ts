import { getRandomBytes } from 'expo-crypto';

import { uuidV7, type IdGenerator } from '@/domain/ids';

export const newId: IdGenerator = () => uuidV7(getRandomBytes(16), Date.now());
