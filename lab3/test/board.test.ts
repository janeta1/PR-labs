/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Board } from '../src/board.js';
import { watch, look, flip, map } from '../src/commands.js';


/**
 * Tests for the Board abstract data type.
 */
describe('Board', function() {

    describe('parseFromFile tests', function() {
        it('Parses valid board file`s dimensions correctly', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            assert.strictEqual(board.getRows(), 3);
            assert.strictEqual(board.getCols(), 3);
        });

        it('Rejects invalid dimension line', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_dim.txt')
            );
        });

        it('Rejects when card count does not match dimensions', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_num_cards.txt')
            );
        });

        it('Rejects when a cell line is empty', async function () {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/empty_card.txt')
            );
        });
    });

    describe('look() tests', async function () {
        it('Shows `my` when cards are controlled by the viewer', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);

            const aliceView = await board.look('alice');
            const lines = aliceView.split('\n').slice(1);
            const card = lines[0];
            assert(card, 'We should have a card here');
            assert(card.startsWith('my'), 'The flipped card should be controlled by the player');
            assert(card.includes('🦄') || card.includes('🌈'), 'The flipped card should show a valid symbol');

            const count = lines.filter(l => l.startsWith('my')).length;
            assert.strictEqual(count, 1, 'Exactly one card should be shown as "my" to alice');
            
        });

        it('Shows `up` for face-up cards controlled by other players', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            const bobView = await board.look('bob');

            const lines = bobView.split('\n').slice(1);
            const card = lines[0];
            assert(card, 'We should have a card here');
            assert(card.startsWith('up'), 'The flipped card should be face up, but not controlled by bob');
        });

        it('Shows `none` for removed cards', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1); // match

            await board.flip('alice', 1, 0); // remove matched cards

            const view = await board.look('alice');
            const lines = view.split('\n').slice(1);
            const firstCard = lines[0];
            const secondCard = lines[1];
            assert(firstCard, 'We should have a card here');
            assert.strictEqual(firstCard, 'none', 'The first matched card should be removed');
            assert(secondCard, 'We should have a card here');
            assert.strictEqual(secondCard, 'none', 'The second matched card should be removed');
        });
    });

    describe('map() tests', function () {
        it('should apply async map() correctly to face down cards and preserve card states', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');  
            
            const originalGrid: (string | null)[][] = [];
            for (let r = 0; r < board.getRows(); r++) {
                originalGrid[r] = [];
                for (let c = 0; c < board.getCols(); c++) {
                    const cell = board.getCell(r, c);
                    assert(cell !== null, `Cell ${r},${c} should exist`);
                    originalGrid[r]![c] = cell.value;
                }
            }

            const f = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🦄') return '🍭';
                return value;
            };

            await map(board, 'alice', f);

            for (let r = 0; r < board.getRows(); r ++) {
                for (let c = 0; c< board.getCols(); c++) {
                    const cell = board.getCell(r, c);
                    assert(cell !== null, `Cell ${r},${c} should exist`);
                    const expected: string | null = cell.value;
                    const originalValue = originalGrid[r]![c];
                    if (originalValue === '🦄') {
                        assert.strictEqual(expected, '🍭', `Cell ${r},${c} value should be transformed from 🦄 to 🍭`);
                    } else {
                        assert.strictEqual(expected, originalValue, `Cell ${r},${c} value should remain unchanged`);
                    }
                }
            } 
        
            const view = await board.look('alice');
            const beforeLines = view.split('\n').slice(1).filter(l => l.trim() !== '');
            for (const line of beforeLines) {
                assert.strictEqual(line, 'down', 'All non-empty card lines should remain face down after map()');
            }
        });

        it('transforms correctly face up cards', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            const originalGrid: (string | null)[][] = [];
            for (let r = 0; r < board.getRows(); r++) {
                originalGrid[r] = [];
                for (let c = 0; c < board.getCols(); c++) {
                    const cell = board.getCell(r, c);
                    assert(cell !== null, `Cell ${r},${c} should exist`);
                    originalGrid[r]![c] = cell.value;
                }
            }

            const f = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🌈') return '☀️';
                return value;
            };

            await map(board, 'alice', f);
            await board.flip('alice', 2, 2); // (2,2) is a 🌈 in perfect.tx
            const cell = board.getCell(2, 2);
            assert(cell !== null, `Cell 2,2 should exist`);
            const expected = cell.value;
            const originalValue = originalGrid[2]![2];
            if (originalValue === '🌈') {
                assert.strictEqual(expected, '☀️', `Cell 2,2 value should be transformed from 🌈 to ☀️`)
            }

            let aliceView = await board.look('alice');
            let lines = aliceView.split('\n').slice(1).filter(l => l.trim() !== '');
            const card = lines[8]; 
            assert(card, 'We should have a card here');
            assert(card.startsWith('my'), 'The flipped card should be controlled by the player');
            assert(card.includes('☀️'), 'The flipped card should show the transformed symbol');
        });

        it('allows multiple map() calls to run concurrently', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            const f1 = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🦄') return '🍭';
                return value;
            };

            const f2 = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🦄') return '☀️';
                return value;  
            };

            const map1 = map(board, 'alice', f1);
            const map2 = map(board, 'bob', f2);

            await Promise.all([map1, map2]);

            // Reveal one card to check it was transformed by either map()
            await board.flip('alice', 0, 0);
            const view = await board.look('alice');
            const lines = view.split('\n').slice(1).filter(l => l.trim() !== '');
            const revealed = lines[0];

            assert(revealed && (revealed.includes('☀️') || revealed.includes('🍭') || revealed.startsWith('my')),
                'A revealed card should reflect one of the concurrent map transforms or be visible');
        });

        it('maintains matching pairs consistency during partial async map()', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            const f = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🦄') return '🍭';
                return value;
            }

            const mapPromise = map(board,'bob', f);

            // Another player flips a card while map is running
            const flipPromise = flip(board, 'bob', 0, 0);

            await Promise.all([mapPromise, flipPromise]);
            await flip(board, 'bob', 0, 1); // flip the matching card

            // After flipping the second, both should be controlled by Bob and show the transformed value
            const view = await look(board, 'bob');
            const lines = view.split('\n').slice(1).filter(l => l.trim() !== '');
            const firstCard = lines[0];
            const secondCard = lines[1];

            assert(firstCard && firstCard.startsWith('my'), 'First card should be controlled by bob');
            assert(secondCard && secondCard.startsWith('my'), 'Second card should be controlled by bob');
            assert(firstCard.includes('🍭') && secondCard.includes('🍭'), 'Both cards should have been transformed by map()');

            // Trigger cleanup (bob flips another card) which should remove the matched pair
            await flip(board, 'bob', 1, 1);
            const afterCleanup = (await look(board, 'bob')).split('\n').slice(1).filter(l => l.trim() !== '');
            assert.strictEqual(afterCleanup[0], 'none', 'First matched card should be removed after cleanup');
            assert.strictEqual(afterCleanup[1], 'none', 'Second matched card should be removed after cleanup');

        });
    });

    describe('watch() tests', function () {
        it('should notify when cards are flipped', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // watching
            const watchPromise = watch(board, 'alice');
            // flipping a card
            await flip(board, 'alice', 0, 0);
            const notification = await watchPromise;
            assert(notification.includes('my'), 'Watch should notify about the flipped card');
        });
        
        it('should notify when cards are removed', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // flipping and matching cards to trigger removal
            await flip(board, 'alice', 0, 0);
            await flip(board, 'alice', 0, 1); // match
            // watching
            const watchPromise = watch(board, 'alice');
            await flip(board, 'alice', 1, 0); // trigger removal
            const notification = await watchPromise;
            assert(notification.includes('none'), 'Watch should notify about the removed cards');
        });

        it('should notify when cards are transformed by map()', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            const f = async (value: string) => {
                await new Promise(res => setTimeout(res, 10));
                if (value === '🦄') return '🍭';
                return value;
            };

            // applying map
            await map(board, 'alice', f);
            // watching
            const watchPromise = watch(board, 'alice');
            await board.flip('alice', 0, 0); // flip a card to see the transformation
            const notification = await watchPromise;
            assert(notification.includes('🍭'), 'Watch should notify about the transformed cards');
        });

        it('should notify multiple watchers independently', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // watching
            const watchPromiseAlice = watch(board, 'alice');
            const watchPromiseBob = watch(board, 'bob');

            // flipping a card
            await flip(board, 'alice', 0, 0);
            const notificationAlice = await watchPromiseAlice;
            const notificationBob = await watchPromiseBob;
            assert(notificationAlice.includes('my'), 'Alice\'s watch should notify about the flipped card');
            assert(notificationBob.includes('up'), 'Bob\'s watch should notify about the flipped card');
        });
    });


    describe('Initial Board State', function() {
        it('All cards face down at start', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const boardState = await board.look('tester');
            const lines = boardState.split('\n').slice(1);
            for (const line of lines) {
                if (line.trim()) {
                    assert.strictEqual(line, 'down', 'All cards should be face down at start');
                }
            }
        });
    });

    describe('Rule 1: First card', function() {
        it('1-A: If there is no card there (the player identified an empty space, perhaps because the card was just removed by another player), the operation fails.', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);
            await board.flip('alice', 1, 0);
            
            await assert.rejects(
                async () => await board.flip('bob', 0, 0),
                /No card at position/
            );

            // testing out of bounds
            await assert.rejects(
                async () => await board.flip('bob', -1, 0),
                /No card at position/
            );
            await assert.rejects(
                async () => await board.flip('bob', 0, -1),
                /No card at position/
            );
            await assert.rejects(
                async () => await board.flip('bob', 100, 0),
                /No card at position/
            );
            await assert.rejects(
                async () => await board.flip('bob', 0, 100),
                /No card at position/
            );
        });

        it('1-B: If the card is face down, it turns face up (all players can now see it) and the player controls that card.', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            const boardState = await board.look('alice');
            const lines = boardState.split('\n').slice(1);
            const card = lines[0];
            assert(card, 'We should have a card here');
            assert(card.startsWith('my'), 'The first flipped card should be controlled by the player');
            assert(card.includes('🦄') || card.includes('🌈'), 'The first flipped card should show a valid symbol');
        });

        it('1-C: If the card is already face up, but not controlled by another player, then it remains face up, and the player controls the card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 2); // not a match, alice loses control

            let cardBob = (await board.look('bob')).split('\n').slice(1)[0];
            assert(cardBob, 'We should have a card here');
            assert(cardBob.startsWith('up'), 'The flipped card should be face up and uncontrolled');

            await board.flip('bob', 0, 0); // bob flips the already face up card

            cardBob = (await board.look('bob')).split('\n').slice(1)[0];
            assert(cardBob, 'We should have a card here');
            assert(cardBob.startsWith('my'), 'The flipped card should now be controlled by bob');
        });

        it('1-D: And if the card is face up and controlled by another player, the operation waits. The player will contend with other players to take control of the card at the next opportunity.', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // alice flips first card
            await board.flip('alice', 0, 0);

            // bob tries to flip the same card, should wait
            const bobFlipPromise = board.flip('bob', 0, 0);
            const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 100));
            const result = await Promise.race([bobFlipPromise, timeout]);
            assert.strictEqual(result, 'timeout', 'Bob should be blocked waiting for alice');
        });

        it('3 waiting players trying to flip the same card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // alice flips first card
            await board.flip('alice', 0, 0);

            const bobPromise = board.flip('bob', 0, 0);
            const charliePromise = board.flip('charlie', 0, 0);
            const davePromise = board.flip('dave', 0, 0);

            // all three should be blocked
            const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 100));
            assert.strictEqual(await Promise.race([bobPromise, timeout]), 'timeout', 'Bob should be blocked waiting for alice');
            assert.strictEqual(await Promise.race([charliePromise, timeout]), 'timeout', 'Charlie should be blocked waiting for alice');
            assert.strictEqual(await Promise.race([davePromise, timeout]), 'timeout', 'Dave should be blocked waiting for alice');

            // when alice flips a different card, bob should take control of the first card
            await board.flip('alice', 0, 2);
            await bobPromise;
            const bobCard = (await board.look('bob')).split('\n').slice(1)[0];
            assert(bobCard, 'We should have a card here for bob');
            assert(bobCard.startsWith('my'), 'Bob should have taken control of the first card');

            // when bob flips a different card, charlie should take control of the first card
            await board.flip('bob', 1, 0);
            await charliePromise;
            const charlieCard = (await board.look('charlie')).split('\n').slice(1)[0];
            assert(charlieCard, 'We should have a card here for charlie');
            assert(charlieCard.startsWith('my'), 'Charlie should have taken control of the first card');

            // when charlie flips a different card, dave should take control of the first card
            await board.flip('charlie', 1, 1);
            await davePromise;
            const daveCard = (await board.look('dave')).split('\n').slice(1)[0];
            assert(daveCard, 'We should have a card here for dave');
            assert(daveCard.startsWith('my'), 'Dave should have taken control of the first card');
            await board.flip('dave', 1, 1);
        });
    });

    describe('Rule 2: Second card', function() {
        it('If there is no card there, the operation fails. The player also relinquishes control of their first card (but it remains face up for now).', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1); // match
            await board.flip('alice', 1, 0); // so the first 2 disappear

            await board.flip('bob', 1, 1); 
            await assert.rejects(
                async () => await board.flip('bob', 0, 0),
                /No card at position/
            );

            const bobView = await board.look('bob');
            const bobLines = bobView.split('\n').slice(1);
            const firstCard = bobLines[4];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('up'), 'Bob should have relinquished control of his first card');
            assert(!firstCard.startsWith('my'), 'Bob should not control the first card');
        });

        it('2-B: If the card is face up and controlled by a player (another player or themselves), the operation fails. To avoid deadlocks, the operation does not wait. The player also relinquishes control of their first card (but it remains face up for now).', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // case 1: controlled by the same player
            await board.flip('alice', 0, 0);
            await assert.rejects(
                async () => await board.flip('alice', 0, 0),
                / controlled by/
            );
            const firstCard = (await board.look('alice')).split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('up'), 'The card remains face up');
            assert(!firstCard.startsWith('my'), 'The player should have relinquished control of the first card');

            //case 2: controlled by another player
            await board.flip('alice', 0, 0);
            await board.flip('bob', 0, 2); 
            await assert.rejects(
                async () => await board.flip('bob', 0, 0),
                / controlled by/
            );

            const bobFirstCard = (await board.look('bob')).split('\n').slice(1)[0];
            assert(bobFirstCard, 'We should have a card here');
            assert(bobFirstCard.startsWith('up'), 'The card remains face up');
            assert(!bobFirstCard.startsWith('my'), 'Bob should have relinquished control of the first card');
        });

        it('2-C: If the card is face down, but not controlled by another player, it turns face up.', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            let aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[1];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('down'), 'The second card should be face down and not controlled initially');

            await board.flip('alice', 0, 1);
            aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[1];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('my'), 'The second card should now be controlled by alice and up');
        });

        it('2-D part 1: If the card is face down and if the two cards are the same, that’s a successful match! The player keeps control of both cards (and they remain face up on the board for now).', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            let aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[1];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('down'), 'The second card should be face down and not controlled initially');

            await board.flip('alice', 0, 1);
            aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[1];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('my'), 'The second card should now be controlled by alice and up');
        });

        it('2-D part 2: If the card is face up but not controlled by a player and if the two cards are the same, that’s a successful match! The player keeps control of both cards (and they remain face up on the board for now).', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 2); // not a match, alice loses control

            await board.flip('bob', 1, 2);
            let bobView = await board.look('bob');
            let firstCard = bobView.split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('up'), 'The first card should be face up and uncontrolled');

            await board.flip('bob', 0, 0); // bob flips the already face up card
            firstCard = (await board.look('bob')).split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('my'), 'The second card chosen by Bob should now be controlled by bob and up');
            const secondCard = (await board.look('bob')).split('\n').slice(1)[5];
            assert(secondCard, 'We should have a card here');
            assert(secondCard.startsWith('my'), 'The first card should now be controlled by bob and up');
        });

        it('2-E part 1: If the card is face down and if the two cards do not match, the player relinquishes control of both cards (again, they remain face up for now).', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            let aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[2];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('down'), 'The second card should be face down and not controlled initially');

            await board.flip('alice', 0, 2); // not a match
            aliceSecondCard = (await board.look('alice')).split('\n').slice(1)[2];
            assert(aliceSecondCard, 'We should have a card here');
            assert(aliceSecondCard.startsWith('up'), 'The second card should now be face up and uncontrolled');
            let aliceFirstCard = (await board.look('alice')).split('\n').slice(1)[0];
            assert(aliceFirstCard, 'We should have a card here');
            assert(aliceFirstCard.startsWith('up'), 'The first card should now be face up and uncontrolled');
        });

        it('2-E part 2: If the card is face up but not controlled by a player and if the two cards do not match, the player relinquishes control of both cards (again, they remain face up for now).', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 2); // not a match, alice loses control

            await board.flip('bob', 0, 2);
            let bobView = await board.look('bob');
            let firstCard = bobView.split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('up'), 'The first card should be face up and uncontrolled');

            await board.flip('bob', 0, 0); // bob flips the already face up card
            firstCard = (await board.look('bob')).split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert(firstCard.startsWith('up'), 'The second card chosen by Bob should now be up and uncontrolled');
            const secondCard = (await board.look('bob')).split('\n').slice(1)[2];
            assert(secondCard, 'We should have a card here');
            assert(secondCard.startsWith('up'), 'The first card chosen by Bob should now be up and uncontrolled');
        });
    });

    describe('Rule 3: Cleanup after turn', function() {
        it('3-A: If they had turned over a matching pair, they control both cards. Now, those cards are removed from the board, and they relinquish control of them.', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');

            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1); // match

            // starting cleanup
            await board.flip('alice', 1, 1);

            const firstCard = (await board.look('alice')).split('\n').slice(1)[0];
            const secondCard = (await board.look('alice')).split('\n').slice(1)[1];
            assert.strictEqual(firstCard, 'none', 'Matched cards removed');
            assert.strictEqual(secondCard, 'none', 'Matched cards removed');
        });

        it('3-B part 1: They had turned over one card, if the card is still on the board, currently face up, and currently not controlled by another player, the card is turned face down.', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');  
            await board.flip('alice', 0, 0);
            await assert.rejects(
                async () => await board.flip('alice', 0, 0), 
                /controlled by/
            );

            // cleanup
            await board.flip('alice', 1, 1);

            const firstCard = (await board.look('alice')).split('\n').slice(1)[0];
            assert(firstCard, 'We should have a card here');
            assert.strictEqual(firstCard, 'down', 'The card should be turned face down and uncontrolled');
        });

        it('3-B part 2: They had turned over two cards that did not match, if either card is still on the board, currently face up, and currently not controlled by another player, that card is turned face down.', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');  
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 2); // not a match

            // cleanup
            await board.flip('alice', 1, 1);
            const firstCard = (await board.look('alice')).split('\n').slice(1)[0];
            const secondCard = (await board.look('alice')).split('\n').slice(1)[2];
            assert(firstCard, 'We should have a card here');
            assert(secondCard, 'We should have a card here');
            assert.strictEqual(firstCard, 'down', 'The first card should be turned face down and uncontrolled');
            assert.strictEqual(secondCard, 'down', 'The second card should be turned face down and uncontrolled');
        });

        it('cleanup only affects cards not controlled by other players', async function () {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 2); // not a match, alice loses control

            await board.flip('bob', 0, 0); // bob flips the already face up card
            await board.flip('alice', 1, 1); // cleanup

            const firstCardBob = (await board.look('bob')).split('\n').slice(1)[0];
            assert(firstCardBob, 'We should have a card here for bob');
            assert(firstCardBob.startsWith('my'), 'Bob should control the first card');
        });
    });
});
