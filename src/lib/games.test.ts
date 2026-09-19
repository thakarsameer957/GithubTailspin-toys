import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [strategyCategory] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [puzzleCategory] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'cat' })
        .returning({ id: categories.id });
    const [pubOne] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });
    const [pubTwo] = await db
        .insert(publishers)
        .values({ name: 'Pub Two', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        const categoryId = i % 2 === 0 ? puzzleCategory.id : strategyCategory.id;
        const publisherId = i % 2 === 0 ? pubTwo.id : pubOne.id;

        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId,
            publisherId,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('returns categories and publishers in deterministic order', async () => {
        await seedGames(db, 2);
        expect(await getAllCategories(db)).toEqual([
            { id: expect.any(Number), name: 'Puzzle' },
            { id: expect.any(Number), name: 'Strategy' },
        ]);
        expect(await getAllPublishers(db)).toEqual([
            { id: expect.any(Number), name: 'Pub One' },
            { id: expect.any(Number), name: 'Pub Two' },
        ]);
    });

    it('filters games by category and publisher together', async () => {
        await seedGames(db, 4);
        const strategy = await getAllCategories(db).then((rows) => rows.find((row) => row.name === 'Strategy'));
        const pubOne = await getAllPublishers(db).then((rows) => rows.find((row) => row.name === 'Pub One'));

        const filtered = await getAllGames(db, {
            categoryIds: strategy ? [strategy.id] : [],
            publisherIds: pubOne ? [pubOne.id] : [],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Game 01', 'Game 03']);
        expect(filtered.every((game) => game.category?.name === 'Strategy')).toBe(true);
        expect(filtered.every((game) => game.publisher?.name === 'Pub One')).toBe(true);
    });

    it('returns an empty list when no game matches the selected category and publisher', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'cat' })
            .returning({ id: categories.id });
        const [pubOne] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Game 01',
            description: 'Description 1',
            starRating: 4.2,
            categoryId: strategy.id,
            publisherId: pubOne.id,
        });

        const filtered = await getAllGames(db, {
            categoryIds: [puzzle.id],
            publisherIds: [pubOne.id],
        });

        expect(filtered).toEqual([]);
    });

    it('filters games by title without regard to case or surrounding whitespace', async () => {
        await seedGames(db, 3);

        const filtered = await getAllGames(db, { titleQuery: '  gAmE 02  ' });

        expect(filtered.map((game) => game.title)).toEqual(['Game 02']);
    });

    it('returns an empty list when no title matches the search query', async () => {
        await seedGames(db, 2);

        expect(await getAllGames(db, { titleQuery: 'missing' })).toEqual([]);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
