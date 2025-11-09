/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';

/**
 * TODO specification
 * Mutable and concurrency safe.
 */
type Cell = {
    value: string | null;
    faceUp: boolean;
    controlledBy: string | null;
}

type Player = {
    id: string;
    firstCard?: { row: number; col: number };
    secondCard?: { row: number; col: number };
    hasMatched: boolean;
}

type Resolver<T> = (value: T | PromiseLike<T>) => void;
type Rejector = (reason: Error) => void;

class Deferred<T> {
    public readonly promise: Promise<T>;
    public readonly resolve: Resolver<T>;
    public readonly reject: Rejector;

    public constructor() {
        const { promise, resolve, reject } = Promise.withResolvers<T>();
        this.promise = promise;
        this.resolve = resolve;
        this.reject = reject;
    }
}


export class Board {
    // fields
    private readonly rows: number;
    private readonly cols: number;

    private readonly grid: Cell[][];
    private readonly players: Map<string, Player> = new Map();
    private boardChangeCallbacks: (() => void)[] = [];
    private readonly waiters: Map<string, Deferred<void>[]> = new Map();
    // Abstraction function:
    //   TODO
    // Representation invariant:
    //   TODO
    // Safety from rep exposure:
    //   TODO

    /**
     * Constructor for Board
     * @param rows - number of rows
     * @param cols - number of columns
     * @param grid - initial grid state
     */
    private constructor(rows: number, cols: number, grid: string[][]) {
        this.rows = rows;
        this.cols = cols;
        this.grid = grid.map(row => row.map(value => ({ value, faceUp: false, controlledBy: null })));

        this.checkRep();
    }
    // TODO checkRep
    private checkRep(): void {
        assert(this.rows > 0, 'Number of rows must be positive');
        assert(this.cols > 0, 'Number of columns must be positive');
        assert(this.grid.length === this.rows, 'Grid row count must match specified rows');

        for (const row of this.grid) {
            assert(row.length === this.cols, 'Grid column count must match specified columns');
            for (const cell of row) {
                assert(cell.value !== undefined, 'Cell value must be defined');
                if (cell.controlledBy !== null) {
                    assert(cell.faceUp, 'Controlled cell must be face up');
                    assert(cell.value !== null, 'Controlled cell must have a value');
                }

                if (cell.value === null) {
                    assert(!cell.faceUp, 'Removed cell must be face down');
                    assert(cell.controlledBy === null, 'Removed cell cannot be controlled');
                }
            }
        }

        assert(this.grid.every(row => row.length === this.cols), 'Grid column count must match columns');
    
        for (const [playerId, player] of this.players) {
            let controlledCount = 0;
            for (const row of this.grid) {
                for (const cell of row) {
                    if (cell.controlledBy === playerId) {
                        controlledCount++;
                    }
                }
            }
            assert(controlledCount <= 2, 
                `Player ${playerId} controls ${controlledCount} cards (max 2)`);
        }
    }
    // TODO other methods
    /**
     * 
     * @returns the number of rows on the board
     */
    public getRows(): number {
        return this.rows;
    }

    /**
     * 
     * @returns the number of columns on the board
     */
    public getCols(): number {
        return this.cols;
    }

    private getPlayer(playerId: string): Player {
        if (!this.players.has(playerId)) {
            this.players.set(playerId, { id: playerId, hasMatched: false });
        }
        const player = this.players.get(playerId);

        if (!player) {
            throw new Error(`Player not found: ${playerId}`);
        }
        return player;
    }

    public look(playerId: string): string {
        let result = `${this.rows}x${this.cols}\n`;
        for (const row of this.grid) {
            for (const cell of row) {
                if (cell.value === null) {
                    result += 'none\n';
                } else if (!cell.faceUp) {
                    result += 'down\n';
                } else if (cell.controlledBy === playerId) {
                    result += `my ${cell.value}\n`;
                } else {
                    result += `up ${cell.value}\n`;
                }
            }
        }
        return result;
    }

    private triggerBoardChange() : void {
        for (const cb of this.boardChangeCallbacks) {
            cb();
        }
        this.boardChangeCallbacks = [];
    }

    private finishPreviousTurn(player: Player): void {
        const { firstCard, secondCard } = player;
        if (!firstCard || !secondCard) {
            return;
        }

        const firstCell = this.grid[firstCard.row]?.[firstCard.col];
        const secondCell = this.grid[secondCard.row]?.[secondCard.col];

        if (!firstCell || !secondCell) {
            throw new Error('Invalid card positions stored for player');
        }

        // if (firstCell.value && firstCell.value === secondCell.value) {
        //     // 3 - A match found
        //     firstCell.value = null;
        //     firstCell.faceUp = false;
        //     firstCell.controlledBy = player.id;

        //     secondCell.value = null;
        //     secondCell.faceUp = false;
        //     secondCell.controlledBy = player.id;
        // } else {
        //     // 3 - B flip back unmatched cards
        //     if (firstCell.faceUp && !firstCell.controlledBy) {
        //         firstCell.faceUp = false;
        //     }
        //     if (secondCell.faceUp && !secondCell.controlledBy) {
        //         secondCell.faceUp = false;
        //     }
        // }

        if (player.hasMatched && firstCell.value !== null && secondCell.value !== null && firstCell.value === secondCell.value) {
            // 3 - A match found - remove the matched cards
            firstCell.value = null;
            firstCell.faceUp = false;
            secondCell.value = null;
            secondCell.faceUp = false;
            this.relinquishControl(firstCard, true);
            this.relinquishControl(secondCard, true);
        } else {
            // 3 - B flip back unmatched cards
            if (firstCell.value !== null && firstCell.faceUp && firstCell.controlledBy === null) {
                firstCell.faceUp = false;
            }
            if (secondCell.value !== null && secondCell.faceUp && secondCell.controlledBy === null) {
                secondCell.faceUp = false;
            }
        }

        player.firstCard = undefined;
        player.secondCard = undefined;
        player.hasMatched = false;
    }

    private async flipFirst(player: Player, row: number, col: number): Promise<void> {
        if (player.firstCard) {
            throw new Error('First card already flipped');
        }
        const cell = this.grid[row]?.[col];

        // 1- A: no card at position
        if (!cell || cell.value === null) {
            throw new Error(`No card at position (${row}, ${col})`);
        }

        // 1 - B, 1 - C: card face down or face up but uncontrolled
        if (!cell.faceUp || cell.controlledBy === null) {
            cell.faceUp = true;
            cell.controlledBy = player.id;
            player.firstCard = { row, col };
        } else {
            // 1 - D: card face up and controlled by another player -> wait in FIFO queue
            const key = `${row},${col}`;
            const deferred = new Deferred<void>();
            const queue = this.waiters.get(key) ?? [];
            queue.push(deferred);
            this.waiters.set(key, queue);
            
            // Wait until relinquishControl wakes up
            await deferred.promise;
            
            // re-checking the cell
            const current = this.grid[row]?.[col];
            if (!current || current.value === null) {
                throw new Error(`The card at position (${row}, ${col}) is no longer available`);
            }
            
            // if still there, flip the card
            current.faceUp = true;
            current.controlledBy = player.id;
            player.firstCard = { row, col };
        }
        return;
    }


    private async flipSecond(player: Player, row: number, col: number): Promise<void> {
        if (!player.firstCard || player.secondCard) {
            throw new Error(`The player has not flipped a first card or has already flipped a second card`);
        }
        const firstCard = player.firstCard;
        const cell = this.grid[row]?.[col];

        // 2 - A: no card at position
        if (!cell || cell.value === null) {
            this.relinquishControl(firstCard);
            player.secondCard = { row, col };
            player.hasMatched = false;
            this.triggerBoardChange();
            throw new Error(`No card at position (${row}, ${col})`);
        }

        // 2 - B already controlled ->  relinquish first
        if (cell.faceUp && cell.controlledBy !== null) {
            this.relinquishControl(firstCard);
            player.secondCard = { row, col };
            player.hasMatched = false;
            this.triggerBoardChange();
            throw new Error(`Card at position (${row}, ${col}) is already controlled by a player`);
        }

        // 2 - C flip up if face down 
        if (!cell.faceUp) {
            cell.faceUp = true;
        }

        player.secondCard = { row, col };

        const firstCell = this.grid[firstCard.row]?.[firstCard.col];
        if (!firstCell) {
            throw new Error('Invalid first card position stored for player');
        }
        // 2 - D/E check for match
        if (firstCell.value === cell.value) {
            // match: keep control
            firstCell.controlledBy = player.id;
            cell.controlledBy = player.id;
            player.hasMatched = true;
        } else {
            // no match: relinquish control
            this.relinquishControl(firstCard);
            this.relinquishControl({ row, col });
            player.hasMatched = false;
        }
        return;
    }

    private relinquishControl(cardPos: { row: number; col: number }, wakeAll = false): void {
        const cell = this.grid[cardPos.row]?.[cardPos.col];
        if (!cell) return;
        cell.controlledBy = null;

        const key = `${cardPos.row},${cardPos.col}`;
        const queue = this.waiters.get(key);

        if (queue && queue.length > 0) {
            // when a card is removed all those waiting for it should be woken up
            if (wakeAll === true) {
                for (const waiter of queue) {
                    waiter.resolve();
                }
                this.waiters.delete(key);
            } else {
                const nextWaiter = queue.shift();
                if (!nextWaiter) {
                    throw new Error('Expected waiter in queue but found none');
                }
                nextWaiter.resolve();
                
                if (queue.length === 0) {
                    this.waiters.delete(key);
                }
            }
        }
    }

    public async flip(playerId: string, row: number, col: number): Promise<void> {
        const player = this.getPlayer(playerId);
        // console.log(`Player ${playerId} is flipping card at (${row}, ${col})`);

        this.finishPreviousTurn(player);

        if (player.firstCard) {
            await this.flipSecond(player, row, col);
        } else {
            await this.flipFirst(player, row, col);
        }

        this.triggerBoardChange();
        this.checkRep();
    }

    public async watch(playerId: string): Promise<string> {
        return new Promise(resolve => {
            this.boardChangeCallbacks.push(() => resolve(this.look(playerId)));
        });
    }

    public async map(playerId: string, f: (card: string) => Promise<string>): Promise<void> {
        const valueMap = new Map<string, Promise<string>>();

        for (const row of this.grid) {
            for (const cell of row) {
                if (cell.value === null) {
                    continue;
                }

                if (!valueMap.has(cell.value)) {
                    valueMap.set(cell.value, f(cell.value));
                }
            }
        }

        const results = new Map<string, string>();
        for (const [originalValue, promise] of valueMap.entries()) {
            results.set(originalValue, await promise);
        }

        for (const row of this.grid) {
            for (const cell of row) {
                if (cell.value === null) {
                    continue;
                }

                const newValue = results.get(cell.value);
                if (newValue !== undefined) {
                    cell.value = newValue;
                }
            }
        }

        this.triggerBoardChange(); // dont know if all players need to be notified here
        this.checkRep();
    }



    /**
     * Make a new board by parsing a file.
     * 
     * PS4 instructions: the specification of this method may not be changed.
     * 
     * @param filename path to game board file
     * @returns a new board with the size and cards from the file
     * @throws Error if the file cannot be read or is not a valid game board
     */
    public static async parseFromFile(filename: string): Promise<Board> {
        try {
            const data = await fs.promises.readFile(filename, 'utf-8');
            const lines = data.trim().split(/\r?\n/);
            // getting rows x columns
            if (lines[0] === '') {
                throw new Error('First line must specify board dimensions');
            }
            const match = lines[0]?.match(/^(\d+)+x(\d+)$/);

            if (!match) {
                throw new Error('First line must be of ROWxCOLUMN format');
            }

            if (match[1] === undefined || match[2] === undefined || match[1] === '' || match[2] === '') {
                throw new Error('Could not parse board dimensions');
            }

            const rows = parseInt(match[1], 10);
            const cols = parseInt(match[2], 10);

            const gridLines = lines.slice(1);
            assert(gridLines.length === rows * cols, `Expected ${rows * cols} cards, found ${gridLines.length}`);

            const grid: string[][] = [];
            for (let r = 0; r < rows; r++) {
                const row: string [] = [];
                for (let c = 0; c < cols; c++) {
                    const cell = gridLines[r * cols + c];
                    if (typeof cell !== 'string' || cell.length === 0) {
                        throw new Error(`Invalid cell value at row ${r}, column ${c}`);
                    }
                    row.push(cell);
                }
                grid.push(row);
            }

            return new Board(rows, cols, grid);
        } catch (err) {
            throw new Error(`Could not read or parse board file: ${err}`);
        }
    }
}
