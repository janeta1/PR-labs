/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Board } from '../src/board.js';

// describe('Sanity', function() {
//   it('runs', function() {
//     console.log("✅ Mocha is running!");
//   });
// });


/**
 * Tests for the Board abstract data type.
 */
describe('Board', function() {

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

/**
 * Example test case that uses async/await to test an asynchronous function.
 * Feel free to delete these example tests.
 */
describe('async test cases', function() {

    it('reads a file asynchronously', async function() {
        const fileContents = (await fs.promises.readFile('boards/ab.txt')).toString();
        assert(fileContents.startsWith('5x5'));
    });
});
