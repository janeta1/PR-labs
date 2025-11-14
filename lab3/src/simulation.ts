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
    const players = 4;
    const tries = 100;
    const minDelay = 0.1;
    const maxDelay = 2.0;

    const stats: {
        flipsAttempted: number; // attempts (first+second)
        failedFlips: number; // failed attempts
        successfulMatches?: number; // successful matches
        errors: {
            first: Map<string, number>;
            second: Map<string, number>;
        };

        startTimeMs?: number;
        endTimeMs?: number;
    }[] = Array.from({ length: players }, () => ({ flipsAttempted: 0, failedFlips: 0, successfulMatches: 0, errors: { first: new Map(), second: new Map() } }));
    
    const mainStart = performance.now();
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ii++) {
        playerPromises.push(player(ii));
    }
    // wait for all the players to finish
    await Promise.all(playerPromises);
    const mainEnd = performance.now();

    console.log('=== FINAL BOARD ===');
    console.log(board.look('observer'));
    console.log('=== Simulation Statistics ===');
    for (let p = 0; p < players; p++) {
        const s = stats[p];
        const duration = (s!.endTimeMs! - s!.startTimeMs!);
        console.log(`Player ${p}:`);
        console.log(`  Duration: ${duration.toFixed(2)} ms`);
        console.log(`  Flips Attempted: ${s!.flipsAttempted}`);
        console.log(`  Failed Flips: ${s!.failedFlips}`);
        console.log(`  Matches completed: ${s!.successfulMatches}`);
        console.log(`  Errors on first flip:`);

        if (s!.errors.first.size === 0) {
            console.log(`    (no errors)`);
        } else {
            for (const [msg, count] of s!.errors.first.entries()) {
                console.log(`    ${msg} → ${count} time${count === 1 ? '' : 's'}`);
            }
        }

        console.log(`  Errors on second flip:`);

        if (s!.errors.second.size === 0) {
            console.log(`    (no errors)`);
        } else {
            for (const [msg, count] of s!.errors.second.entries()) {
                console.log(`    ${msg} → ${count} time${count === 1 ? '' : 's'}`);
            }
        }

        console.log(""); // empty line between players

    }
    console.log(`Total Simulation Time: ${(mainEnd - mainStart).toFixed(2)} ms`);

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        // TODO set up this player on the board if necessary
        const playerId = `player${playerNumber}`;
        if (!stats[playerNumber]) {
            stats[playerNumber] = { flipsAttempted: 0, failedFlips: 0, successfulMatches: 0, errors: { first: new Map(), second: new Map() } };
        }
        stats[playerNumber].startTimeMs = performance.now();

        for (let jj = 0; jj < tries; jj++) {
            try {
                await timeout(minDelay + Math.random() * (maxDelay - minDelay));
                // trying to flip over a first card at (randomInt(size), randomInt(size))
                //      which might wait until this player can control that card
                const sizeRows = board.getRows();
                const sizeCols = board.getCols();
                const firstRow = randomInt(sizeRows);
                const firstCol = randomInt(sizeCols);
                try {
                    stats[playerNumber].flipsAttempted += 1;
                    await board.flip(`player${playerNumber}`, firstRow, firstCol);
                } catch (err) {
                    stats[playerNumber].failedFlips += 1;
                    const prev = stats[playerNumber].errors.first.get((err as Error).message) ?? 0;
                    stats[playerNumber].errors.first.set((err as Error).message, prev + 1);
                    continue;
                }

                await timeout(minDelay + Math.random() * (maxDelay - minDelay));
                // and if that succeeded,
                //      try to flip over a second card at (randomInt(size), randomInt(size))
                const secondRow = randomInt(sizeRows);
                const secondCol = randomInt(sizeCols);
                try {
                    stats[playerNumber].flipsAttempted += 1;
                    await board.flip(`player${playerNumber}`, secondRow, secondCol);
                    stats[playerNumber].successfulMatches! += 1;
                    
                } catch (err) {
                    stats[playerNumber].failedFlips += 1;
                    const prev = stats[playerNumber].errors.second.get((err as Error).message) ?? 0;
                    stats[playerNumber].errors.second.set((err as Error).message, prev + 1);
                    // console.error('attempt to flip a card failed:', err);
                    continue;
                }  
                
            } catch (err) {
               console.log('Unexpected error in player simulation:', err);
                continue;
            }
        }
        stats[playerNumber].endTimeMs = performance.now();
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
