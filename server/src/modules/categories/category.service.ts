import { Types, type ClientSession } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { TransactionModel } from '../transactions/transaction.model';

import { CategoryModel, type Category, type CategoryType } from './category.model';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.schemas';

export type PublicCategory = {
  id: string;
  name: string;
  group: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

type CategoryLike = Category & { _id: Types.ObjectId };

export function toPublicCategory(category: CategoryLike): PublicCategory {
  return {
    id: String(category._id),
    name: category.name,
    group: category.group,
    type: category.type as CategoryType,
    icon: category.icon,
    color: category.color,
    isDefault: category.isDefault,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

/**
 * The filter every category read uses: this user's own categories, plus the
 * system ones that belong to nobody.
 *
 * Written once and reused so there is no route where a missing `$or` branch
 * quietly exposes another user's rows.
 */
function visibleTo(userId: string) {
  return { $or: [{ userId: null }, { userId: new Types.ObjectId(userId) }] };
}

export async function requireOwnedCategory(
  userId: string,
  categoryId: string,
  session?: ClientSession,
) {
  const category = await CategoryModel.findOne({
    _id: categoryId,
    ...visibleTo(userId),
  }).session(session ?? null);

  if (!category) throw ApiError.notFound('Category not found', { categoryId });
  return category;
}

export async function listCategories(
  userId: string,
  filter: { type?: CategoryType; includeArchived: boolean },
): Promise<PublicCategory[]> {
  const categories = await CategoryModel.find({
    ...visibleTo(userId),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.includeArchived ? {} : { isActive: true }),
  })
    // Groups keep the order they were seeded in, and items keep their order inside
    // a group. An alphabetical picker would open on "Activities" and "Alcohol",
    // which is nobody's most common expense.
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return categories.map(toPublicCategory);
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
): Promise<PublicCategory> {
  const duplicate = await CategoryModel.exists({
    userId: new Types.ObjectId(userId),
    name: input.name,
    group: input.group,
    isActive: true,
  });
  if (duplicate) {
    throw ApiError.conflict(`"${input.name}" already exists under ${input.group}`);
  }

  // A user's own category sorts after every seeded one, which keeps the familiar
  // list stable and puts new additions where the user expects to find them.
  const last = await CategoryModel.findOne({ userId: new Types.ObjectId(userId) })
    .sort({ sortOrder: -1 })
    .select('sortOrder')
    .lean();

  const category = await CategoryModel.create({
    ...input,
    userId: new Types.ObjectId(userId),
    isDefault: false,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  });

  return toPublicCategory(category);
}

/**
 * Seeded categories are read-only.
 *
 * They are shared by name with the app's own charts and with the Indian default
 * tree that new users get, so letting one be renamed to "Misc" would make two
 * accounts' data stop meaning the same thing. Someone who wants their own name
 * makes their own category — which is one tap and costs nothing.
 */
function assertEditable(category: { isDefault: boolean; userId?: Types.ObjectId | null }): void {
  if (category.isDefault || !category.userId) {
    throw ApiError.forbidden('Built-in categories cannot be changed. Create your own instead.');
  }
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  patch: UpdateCategoryInput,
): Promise<PublicCategory> {
  const category = await requireOwnedCategory(userId, categoryId);
  assertEditable(category);

  Object.assign(category, patch);
  await category.save();

  return toPublicCategory(category);
}

/**
 * Archives a category that has transactions, deletes one that does not.
 *
 * Same reasoning as accounts: deleting a category out from under three months of
 * transactions turns them all into uncategorised rows, which is a worse outcome
 * than a picker with one fewer option.
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<{ deleted: boolean; archived: boolean }> {
  const category = await requireOwnedCategory(userId, categoryId);
  assertEditable(category);

  const referenced = await TransactionModel.exists({
    userId: new Types.ObjectId(userId),
    categoryId: category._id,
  });

  if (!referenced) {
    await category.deleteOne();
    return { deleted: true, archived: false };
  }

  category.isActive = false;
  await category.save();
  return { deleted: false, archived: true };
}
