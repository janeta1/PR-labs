/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';

/**
 * Represents a cell on the board, along with its value, state, and controlling player (if exists).
 */
type Cell = {
    value: string | null;
    faceUp: boolean;
    controlledBy: string | null;
}

/**
 * Represents a player in the game, including their ID and the cards they have flipped.
 */
type Player = {
    id: string;
    firstCard?: { row: number; col: number };
    secondCard?: { row: number; col: number };
    hasMatched: boolean;
}

/**
 * A resolver function for a promise. It is used to resolve the promise with a value or another promise.
 */
type Resolver<T> = (value: T | PromiseLike<T>) => void;


/**
 * A rejector function for a promise. It is used to reject the promise with an error.
 */
type Rejector = (reason: Error) => void;


/**
 * A deferred promise that exposes its resolve and reject functions. Used for waiting players.
 */
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

/**
 * Mutable and concurrency safe.
 * 
 * Represents a Memory Scramble game board.  The board consists of a grid of cards,
 * each of which can be face up or face down, and can be controlled by a player.
 * Players flip cards to find matching pairs. Multiple players can play concurrently on the same board,
 * following the rules of the game.
 */
export class Board {
    // fields
    private readonly rows: number;
    private readonly cols: number;

    private readonly grid: Cell[][];
    private readonly players: Map<string, Player> = new Map();
    private boardChangeCallbacks: (() => void)[] = [];
    private readonly waiters: Map<string, Deferred<void>[]> = new Map();
    // Abstraction function:
    //  AF(rows, cols, grid, players, boardChangeCallbacks, waiters) = 
    //      A mutable, concurrent game board for a Memory Scramble game
    //      consisting of `rows x cols` cells, where each cell may conain
    //      a card (string value) or be empty (null). 
    //
    //      For each cell in grid[row][col]:
    //          - cell.value is the card value (string) or null if removed
    //          - cell.faceUp indicates whether the card is face up (true) or face down (false)
    //          - cell.controlledBy is the ID of the player currently controlling the card, or null if uncontrolled
    //
    //      players maps each player ID to their current turn state:
    //          - id is the player's unique identifier
    //          - firstCard and secondCard store the positions of the cards the player has flipped this turn
    //          - hasMatched indicates whether the player has found a matching pair this turn
    //
    //      boardChangeCallbacks stores functions to call when the board state changes.
    //      These callbacks represent “watching” players.
    //
    //      waiters stores queues of players waiting to flip specific cards that are currently controlled by other players.
    // Representation invariant:
    //   - rows > 0 and cols > 0
    //   - grid has exactly `rows` rows and each row has exactly `cols` columns
    //   - For each cell in grid:
    //      - cell.value is defined (may be null for removed cards, but not undefined)
    //      - if cell.value === null:
    //          - cell.faceUp === false
    //          - cell.controlledBy === null
    //          (a removed card is face-down and uncontrolled)
    //      - if cell.controlledBy !== null:
    //          - cell.faceUp === true
    //          - cell.value !== null
    //          (a controlled card is face-up and has a value)
    //   - Each player in `players` controls at most two cards.
    //   - Every card's control belongs to at most one player.
    // Safety from rep exposure:
    //   - all fields are private
    //   - internal mutable data (grid, players, waiters) are never returned directly
    //   - parseFromFile creates a new Board instance with a deep copy of the parsed grid data

    /**
     * Constructor for Board
     * 
     * @param rows - number of rows; must be a nonnegative integer
     * @param cols - number of columns; must be a nonnegative integer
     * @param grid - initial grid state; a 2D array of strings representing card values
     */
    private constructor(rows: number, cols: number, grid: string[][]) {
        this.rows = rows;
        this.cols = cols;
        this.grid = grid.map(row => row.map(value => ({ value, faceUp: false, controlledBy: null })));

        this.checkRep();
    }
    
    /**
     * Checks that the representation invariant holds.
     *
     * @throws an error if the representation invariant is violated.
     */
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

            for (const cardPos of [player.firstCard, player.secondCard]) {
                if (cardPos) {
                    const { row: r, col: c } = cardPos;
                    assert(r >= 0 && r < this.rows && c >= 0 && c < this.cols,
                        `Player ${playerId} has card position out of bounds: (${r}, ${c})`);
                }
            }
        }
    }

    /**
     * Provides the number of rows on the board.
     * 
     * @returns the number of rows on the board
     */
    public getRows(): number {
        return this.rows;
    }

    /**
     * Provides the number of columns on the board.
     * 
     * @returns the number of columns on the board
     */
    public getCols(): number {
        return this.cols;
    }

    public getCell(row: number, col: number): Cell | null {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols || this.grid[row] === undefined || this.grid[row][col] === undefined ) {
            return null;
        }
        const c = this.grid[row]?.[col];
        return c ? { value: c.value, faceUp: c.faceUp, controlledBy: c.controlledBy } : null;
    }

    /**
     * Creates or retrieves a player by ID.
     * 
     * @param playerId - ID of the player; must be a nonempty string of alphanumeric or underscore characters
     * @returns the player object (created or existing)
     */
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

    /**
     * Looks at the current state of the board from the perspective of a player.
     * 
     * @spec Pre: playerId non-empty. Post: returns a string representation of the board from the perspective of the specified player.
     * @param playerId - ID of the player; must be a nonempty string of alphanumeric or underscore characters
     * @returns a string representation of the board from the perspective of the specified player
     */
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

    /**
     * Notifies all `watching` players of a board change.
     * 
     */
    private triggerBoardChange() : void {
        for (const cb of this.boardChangeCallbacks) {
            try {
                cb();
            } catch (error) {
                console.error('Error in board change callback:', error);
            }
        }
        this.boardChangeCallbacks = [];
    }

    /**
     * A helper method to finish a player's previous turn.
     * The method handles the logic for completing a player's previous turn by checking
     * the cards they flipped and updating the board state accordingly.
     * It applies the rules 3-A - 3-B of the game, i.e. removing matched cards or flipping back unmatched and uncontrolled cards.
     * 
     * @param player - the player whose previous turn is to be finished; must be a valid Player object
     * @returns - nothing
     * 
     * @throws - an error if the player's stored card positions are invalid
     *           (either out of bounds or the card is no longer available)
     */
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
                // if (!this.isRemembered(firstCard.row, firstCard.col, player.id)) {
                //     firstCell.faceUp = false;
                // }
                firstCell.faceUp = false;
            }
            if (secondCell.value !== null && secondCell.faceUp && secondCell.controlledBy === null) {
                // if (!this.isRemembered(secondCard.row, secondCard.col, player.id)) {
                //     secondCell.faceUp = false;
                // }
                secondCell.faceUp = false;
            }
        }

        player.firstCard = undefined;
        player.secondCard = undefined;
        player.hasMatched = false;
    }

    /**
     * Helper method to check if a card at (row, col) is remembered by any other player, 
     * other than the current player passed as an argument.
     * 
     * @param row - the row index of the card to check; 
     *              must be a nonnegative integer less than the number of rows on the board
     * @param col - the column index of the card to check; 
     *              must be a nonnegative integer less than the number of columns on the board
     * @param currentPlayer - the ID of the player to exclude from the check; 
     *                        must be a nonempty string of alphanumeric or underscore characters
     * @returns - true if the card is remembered by any other player, false otherwise
     */
    private isRemembered(row: number, col: number, currentPlayer: string): boolean {
        for (const [playerId, player] of this.players) {
            if (playerId === currentPlayer) continue;
            if (player.firstCard && player.firstCard.row === row && player.firstCard.col === col) {
                return true;
            }
            if (player.secondCard && player.secondCard.row === row && player.secondCard.col === col) {
                return true;
            }
        }
        return false;
    }

    /**
     * A helper method for the main flip() function.
     * The method handles the logic for flipping the player's first card on the board and
     * implements the 1-A - 1-D steps of the game rules.
     * 
     * @param player - the player attempting a first card flip; must be a valid Player object
     * @param row - the row index of the card to flip;  must be a nonnegative integer less than the number of rows on the board
     * @param col - the column index of the card to flip; must be a nonnegative integer less than the number of columns on the board
     * @returns - a promise that resolves when the flip action is complete
     * 
     * @throws - an error if the flip action cannot be completed due to game rules 
     *          (e.g., flipping a card that is no longer available (null value))
     */
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
            // this.finishPreviousTurn(player);
            // this.checkRep();
            // this.triggerBoardChange();
            const key = `${row},${col}`;
            const deferred = new Deferred<void>();
            const queue = this.waiters.get(key) ?? [];
            queue.push(deferred);
            this.waiters.set(key, queue);
            
            // Wait until relinquishControl wakes up
            // console.log(`Player ${player.id} is waiting to flip card at (${row}, ${col})`);
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
        // console.log(`Player ${player.id} successfully flipped first card at (${row}, ${col})`);
        return;
    }

    /**
     * A helper method for the main flip() function.
     * The method handles the logic for flipping the player's second card on the board and
     * implements the 2-A - 2-E steps of the game rules.
     * 
     * @param player - the player attempting a second card flip; must be a valid Player object
     * @param row - the row index of the card to flip;  must be a nonnegative integer less than the number of rows on the board
     * @param col - the column index of the card to flip; must be a nonnegative integer less than the number of columns on the board
     * @returns - a promise that resolves when the flip action is complete
     *
     * @throws - an error if the flip action cannot be completed due to game rules
     *         (e.g., flipping a card that is already controlled by another player)
     */
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
            this.checkRep();
            this.triggerBoardChange();
            throw new Error(`No card at position (${row}, ${col})`);
        }

        // 2 - B already controlled ->  relinquish first
        if (cell.faceUp && cell.controlledBy !== null) {
            this.relinquishControl(firstCard);
            player.secondCard = { row, col };
            player.hasMatched = false;
            this.checkRep();
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
        // console.log(`Player ${player.id} successfully flipped second card at (${row}, ${col})`);
        return;
    }

    /**
     * A helper method to relinquish control of a card at a given position.
     * Checks if there are any players waiting on the card. 
     * If so, if the card is relinquished with wakeAll=true (the card was removed), 
     * all waiters are woken up. Otherwise, only the next waiter is woken up,
     * thus giving them control of the card.
     * 
     * @param cardPos - the position (row and column) of the card to relinquish control of; must be a valid position on the board
     * @param wakeAll - if true, all waiters for this card are woken up; otherwise, only the next waiter is woken up
     * @returns - void
     */
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

    /**
     * Main method to flip a card on the board. 
     * The method first calls finishPreviousTurn to complete any unfinished turns for the player.
     * If the player has not flipped a first card yet, it calls flipFirst to handle the first card flip logic.
     * If the player has already flipped a first card, it calls flipSecond to handle the second card flip logic.
     * Finally, it triggers board change notifications and checks the representation invariant.
     * 
     * @spec Pre: playerId non-empty, row and col within board bounds. Post: flips the specified card for the player, following game rules.
     * @param playerId - ID of the player making the flip; must be a nonempty string of alphanumeric or underscore characters
     * @param row - row number of card to flip; must be a nonnegative integer less than the number of rows on the board
     * @param col - column number of card to flip; must be a nonnegative integer less than the number of columns on the board
     * @returns - a promise that resolves when the flip action is complete
     */
    public async flip(playerId: string, row: number, col: number): Promise<void> {
        // assert(false, "Intentional crash for testing");
        const player = this.getPlayer(playerId);
        // console.log(`Player ${playerId} is flipping card at (${row}, ${col})`);

        this.finishPreviousTurn(player);

        if (player.firstCard) {
            await this.flipSecond(player, row, col);
        } else {
            await this.flipFirst(player, row, col);
        }

        this.checkRep();
        this.triggerBoardChange();
    }

    /**
     * The method allows a player to watch the board for changes.
     * 
     * @param playerId - ID of the player watching the board; must be a nonempty string of alphanumeric or underscore characters
     */
    public async watch(playerId: string): Promise<void> {
        return new Promise(resolve => {
            this.boardChangeCallbacks.push(() => resolve());
        });
    }

    /**
     * The method modifies the board by applying an asynchronous function to each unique card value on the board.
     * The function does not block player actions while it is being applied. It also does
     * not not prevent other commands on the board from interleaving with it while it is running.
     * 
     * @spec Pre: f is a valid function. Post: applies f to each unique card on the board, updating their values.
     * @param f - mathematical function from cards to cards
     * @returns - a promise that resolves when the map action is complete
     */
    public async map(f: (card: string) => Promise<string>): Promise<void> {
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
        this.checkRep();
        this.triggerBoardChange(); // dont know if all players need to be notified here
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
            const board = new Board(rows, cols, grid);
            board.checkRep();
            return board;
        } catch (err) {
            throw new Error(`Could not read or parse board file: ${err}`);
        }
    }
}
