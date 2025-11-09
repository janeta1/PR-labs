/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import { Board } from './board.js';

/**
 * Example code for simulating a game.
 * 
 * PS4 instructions: you may use, modify, or remove this file,
 *   completing it is recommended but not required.
 * 
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/perfect.txt';
    const board: Board = await Board.parseFromFile(filename);
    const size = 3;
    const players = 4;
    const tries = 10;
    const maxDelayMilliseconds = 100;

    // Print initial board state
    console.log('=== INITIAL BOARD ===');
    console.log(board.look('observer'));
    console.log('');

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii));
    }
    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);
    
    // Print final board state
    console.log('=== FINAL BOARD ===');
    console.log(board.look('observer'));
    console.log('Game complete!');

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        // TODO set up this player on the board if necessary

        for (let jj = 0; jj < tries; ++jj) {
            try {
                await timeout(Math.random() * maxDelayMilliseconds);
                // TODO try to flip over a first card at (randomInt(size), randomInt(size))
                //      which might wait until this player can control that card
                const firstRow = randomInt(size);
                const firstCol = randomInt(size);
                try {
                    console.log(`\nPlayer ${playerNumber} attempting first flip at (${firstRow}, ${firstCol})`);
                    await board.flip(`player${playerNumber}`, firstRow, firstCol);
                    console.log(`Player ${playerNumber} successfully flipped first card`);
                } catch (err) {
                    console.error('attempt to flip a card failed:', err);
                    continue;
                }

                await timeout(Math.random() * maxDelayMilliseconds);
                // TODO and if that succeeded,
                //      try to flip over a second card at (randomInt(size), randomInt(size))
                const secondRow = randomInt(size);
                const secondCol = randomInt(size);
                try {
                    console.log(`Player ${playerNumber} attempting second flip at (${secondRow}, ${secondCol})`);
                    await board.flip(`player${playerNumber}`, secondRow, secondCol);
                    console.log(`Player ${playerNumber} successfully flipped second card`);
                    
                    // Print board state after each complete turn
                    console.log('--- Board State ---');
                    console.log(board.look(`player${playerNumber}`));
                } catch (err) {
                    console.error('attempt to flip a card failed:', err);
                    continue;
                }         
            } catch (err) {
                console.error('attempt to flip a card failed:', err);
            }
        }
    }
}

/**
 * Random positive integer generator
 * 
 * @param max a positive integer which is the upper bound of the generated number
 * @returns a random integer >= 0 and < max
 */
function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
}


/**
 * @param milliseconds duration to wait
 * @returns a promise that fulfills no less than `milliseconds` after timeout() was called
 */
async function timeout(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
}

void simulationMain();
