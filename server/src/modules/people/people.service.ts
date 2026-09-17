import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { MoneyOwedModel } from '../moneyOwed/moneyOwed.model';

import { PersonModel, type Person } from './person.model';
import type { CreatePersonInput, UpdatePersonInput } from './people.schemas';

export type PublicPerson = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  note?: string;
  totalOwedToMe: number;
  totalIOwe: number;
  activeObligationsCount: number;
  createdAt: string;
  updatedAt: string;
};

type PersonDoc = Person & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };

export function toPublicPerson(
  person: PersonDoc,
  owedToMe = 0,
  iOwe = 0,
  activeCount = 0,
): PublicPerson {
  return {
    id: String(person._id),
    name: person.name,
    ...(person.phone ? { phone: person.phone } : {}),
    ...(person.email ? { email: person.email } : {}),
    ...(person.avatar ? { avatar: person.avatar } : {}),
    ...(person.note ? { note: person.note } : {}),
    totalOwedToMe: owedToMe,
    totalIOwe: iOwe,
    activeObligationsCount: activeCount,
    createdAt: (person.createdAt ?? new Date()).toISOString(),
    updatedAt: (person.updatedAt ?? new Date()).toISOString(),
  };
}

export async function requireOwnedPerson(userId: string, personId: string) {
  const person = await PersonModel.findOne({
    _id: new Types.ObjectId(personId),
    userId: new Types.ObjectId(userId),
  });

  if (!person) throw ApiError.notFound('Person not found', { personId });
  return person;
}

export async function listPeople(userId: string, search?: string): Promise<PublicPerson[]> {
  const userObjectId = new Types.ObjectId(userId);
  const filter: Record<string, unknown> = { userId: userObjectId };

  if (search && search.trim().length > 0) {
    filter.name = { $regex: search.trim(), $options: 'i' };
  }

  const people = await PersonModel.find(filter).sort({ name: 1 }).lean();

  // Aggregate active obligation sums per person
  const activeObligations = await MoneyOwedModel.aggregate([
    {
      $match: {
        userId: userObjectId,
        status: 'active',
      },
    },
    {
      $group: {
        _id: { personId: '$personId', direction: '$direction' },
        totalRemaining: { $sum: '$remainingAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const personStats = new Map<string, { owedToMe: number; iOwe: number; count: number }>();
  for (const item of activeObligations) {
    const pid = String(item._id.personId);
    const existing = personStats.get(pid) ?? { owedToMe: 0, iOwe: 0, count: 0 };
    if (item._id.direction === 'owed_to_me') {
      existing.owedToMe += item.totalRemaining;
    } else if (item._id.direction === 'i_owe') {
      existing.iOwe += item.totalRemaining;
    }
    existing.count += item.count;
    personStats.set(pid, existing);
  }

  return people.map((p) => {
    const stats = personStats.get(String(p._id)) ?? { owedToMe: 0, iOwe: 0, count: 0 };
    return toPublicPerson(p as PersonDoc, stats.owedToMe, stats.iOwe, stats.count);
  });
}

export async function getPerson(userId: string, personId: string): Promise<PublicPerson> {
  const person = await requireOwnedPerson(userId, personId);
  const stats = await getPersonStats(userId, personId);
  return toPublicPerson(person as unknown as PersonDoc, stats.owedToMe, stats.iOwe, stats.count);
}

export async function createPerson(
  userId: string,
  input: CreatePersonInput,
): Promise<PublicPerson> {
  const userObjectId = new Types.ObjectId(userId);
  const trimmedName = input.name.trim();

  const existing = await PersonModel.findOne({
    userId: userObjectId,
    name: trimmedName,
  }).collation({ locale: 'en', strength: 2 });

  if (existing) {
    const stats = await getPersonStats(userId, String(existing._id));
    return toPublicPerson(existing as unknown as PersonDoc, stats.owedToMe, stats.iOwe, stats.count);
  }

  const person = await PersonModel.create({
    userId: userObjectId,
    name: trimmedName,
    phone: input.phone?.trim() ?? '',
    email: input.email?.trim() ?? '',
    avatar: input.avatar?.trim() ?? '',
    note: input.note?.trim() ?? '',
  });

  return toPublicPerson(person as unknown as PersonDoc, 0, 0, 0);
}

export async function findOrCreatePerson(userId: string, name: string): Promise<PublicPerson> {
  return createPerson(userId, { name });
}

export async function updatePerson(
  userId: string,
  personId: string,
  patch: UpdatePersonInput,
): Promise<PublicPerson> {
  const person = await requireOwnedPerson(userId, personId);

  if (patch.name && patch.name.trim().toLowerCase() !== person.name.toLowerCase()) {
    const duplicate = await PersonModel.findOne({
      userId: new Types.ObjectId(userId),
      name: patch.name.trim(),
      _id: { $ne: person._id },
    }).collation({ locale: 'en', strength: 2 });

    if (duplicate) {
      throw ApiError.conflict(`A person named "${patch.name.trim()}" already exists`);
    }
  }

  if (patch.name !== undefined) person.name = patch.name.trim();
  if (patch.phone !== undefined) person.phone = patch.phone.trim();
  if (patch.email !== undefined) person.email = patch.email.trim();
  if (patch.avatar !== undefined) person.avatar = patch.avatar.trim();
  if (patch.note !== undefined) person.note = patch.note.trim();

  await person.save();
  const stats = await getPersonStats(userId, personId);
  return toPublicPerson(person as unknown as PersonDoc, stats.owedToMe, stats.iOwe, stats.count);
}

export async function deletePerson(
  userId: string,
  personId: string,
): Promise<{ deleted: boolean }> {
  const person = await requireOwnedPerson(userId, personId);

  // Safety check: Cannot delete a person with active obligations
  const activeCount = await MoneyOwedModel.countDocuments({
    userId: new Types.ObjectId(userId),
    personId: person._id,
    status: 'active',
  });

  if (activeCount > 0) {
    throw ApiError.badRequest(
      'Cannot delete person with active obligations. Settle or write them off first.',
    );
  }

  await person.deleteOne();
  return { deleted: true };
}

export async function getPeopleSummary(userId: string): Promise<{
  totalOwedToMe: number;
  totalIOwe: number;
  netBalance: number;
  peopleCount: number;
}> {
  const userObjectId = new Types.ObjectId(userId);

  const [activeTotals, peopleCount] = await Promise.all([
    MoneyOwedModel.aggregate([
      {
        $match: {
          userId: userObjectId,
          status: 'active',
        },
      },
      {
        $group: {
          _id: '$direction',
          total: { $sum: '$remainingAmount' },
        },
      },
    ]),
    PersonModel.countDocuments({ userId: userObjectId }),
  ]);

  let totalOwedToMe = 0;
  let totalIOwe = 0;

  for (const item of activeTotals) {
    if (item._id === 'owed_to_me') totalOwedToMe = item.total;
    if (item._id === 'i_owe') totalIOwe = item.total;
  }

  return {
    totalOwedToMe,
    totalIOwe,
    netBalance: totalOwedToMe - totalIOwe,
    peopleCount,
  };
}

async function getPersonStats(userId: string, personId: string) {
  const results = await MoneyOwedModel.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        personId: new Types.ObjectId(personId),
        status: 'active',
      },
    },
    {
      $group: {
        _id: '$direction',
        total: { $sum: '$remainingAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let owedToMe = 0;
  let iOwe = 0;
  let count = 0;

  for (const item of results) {
    if (item._id === 'owed_to_me') owedToMe += item.total;
    if (item._id === 'i_owe') iOwe += item.total;
    count += item.count;
  }

  return { owedToMe, iOwe, count };
}
