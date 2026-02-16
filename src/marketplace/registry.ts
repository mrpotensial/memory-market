import initSqlJs, { type Database } from "sql.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// === Types ===

export interface PackageListing {
  id: string;
  name: string;
  description: string;
  tags: string;
  priceMon: number;
  tokenAddress: string | null;
  curveAddress: string | null;
  creatorAddress: string | null;
  packagePath: string;
  fileCount: number;
  chunkCount: number;
  entityCount: number;
  timesSold: number;
  createdAt: string;
}

export interface SaleRecord {
  id: number;
  packageId: string;
  buyerAddress: string;
  amountMon: number;
  txHash: string;
  createdAt: string;
}

export interface BountyRecord {
  id: string;
  topic: string;
  rewardMon: number;
  requester: string;
  fulfiller: string | null;
  status: string;
  createdAt: string;
}

export interface RatingRecord {
  id: number;
  packageId: string;
  raterAddress: string;
  stars: number;
  comment: string;
  createdAt: string;
}

export interface PackageRating {
  avg: number;
  count: number;
}

// === Registry ===

/**
 * SQLite-backed marketplace registry for knowledge packages.
 * Uses sql.js (pure JS SQLite) for zero-native-dependency operation.
 *
 * Data stored at: ~/.memory-markets/registry.db
 */
export class MarketplaceRegistry {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const dataDir = join(homedir(), ".memory-markets");
    mkdirSync(dataDir, { recursive: true });
    this.dbPath = dbPath ?? join(dataDir, "registry.db");
  }

  /** Initialize the database (async due to sql.js WASM loading) */
  async init(): Promise<void> {
    const SQL = await initSqlJs();

    // Load existing DB file if present
    if (existsSync(this.dbPath)) {
      const fileBuffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Registry not initialized. Call init() first.");
    }
    return this.db;
  }

  private createTables(): void {
    const db = this.getDb();

    db.run(`
      CREATE TABLE IF NOT EXISTS packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        price_mon REAL NOT NULL DEFAULT 0,
        token_address TEXT,
        curve_address TEXT,
        creator_address TEXT,
        package_path TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        entity_count INTEGER NOT NULL DEFAULT 0,
        times_sold INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id TEXT NOT NULL,
        buyer_address TEXT NOT NULL,
        amount_mon REAL NOT NULL,
        tx_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (package_id) REFERENCES packages(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS bounties (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        reward_mon REAL NOT NULL DEFAULT 0,
        requester TEXT NOT NULL,
        fulfiller TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id TEXT NOT NULL,
        rater_address TEXT NOT NULL,
        stars INTEGER NOT NULL CHECK(stars >= 1 AND stars <= 5),
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (package_id) REFERENCES packages(id)
      )
    `);

    this.persist();
  }

  /** Persist the in-memory database to disk */
  private persist(): void {
    const db = this.getDb();
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  /** List a knowledge package on the marketplace */
  listPackage(listing: Omit<PackageListing, "timesSold" | "createdAt">): void {
    const db = this.getDb();

    db.run(
      `INSERT OR REPLACE INTO packages
        (id, name, description, tags, price_mon, token_address, curve_address,
         creator_address, package_path, file_count, chunk_count, entity_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        listing.id,
        listing.name,
        listing.description,
        listing.tags,
        listing.priceMon,
        listing.tokenAddress,
        listing.curveAddress,
        listing.creatorAddress,
        listing.packagePath,
        listing.fileCount,
        listing.chunkCount,
        listing.entityCount,
      ],
    );

    this.persist();
  }

  /** Get a single package by ID */
  getPackage(id: string): PackageListing | null {
    const db = this.getDb();
    const stmt = db.prepare("SELECT * FROM packages WHERE id = ?");
    stmt.bind([id]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject();
    stmt.free();
    return this.rowToListing(row);
  }

  /** Get all listed packages */
  getAllPackages(): PackageListing[] {
    const db = this.getDb();
    const results = db.exec("SELECT * FROM packages ORDER BY created_at DESC");

    if (results.length === 0) return [];

    const { columns, values } = results[0];
    return values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return this.rowToListing(obj);
    });
  }

  /** Search packages by keyword in name, description, and tags */
  searchByKeyword(query: string): PackageListing[] {
    const db = this.getDb();
    const pattern = `%${query}%`;

    const stmt = db.prepare(
      `SELECT * FROM packages
       WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
       ORDER BY times_sold DESC, created_at DESC`,
    );
    stmt.bind([pattern, pattern, pattern]);

    const results: PackageListing[] = [];
    while (stmt.step()) {
      results.push(this.rowToListing(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  /** Record a sale transaction */
  recordSale(
    packageId: string,
    buyerAddress: string,
    amountMon: number,
    txHash: string,
  ): void {
    const db = this.getDb();

    db.run(
      `INSERT INTO transactions (package_id, buyer_address, amount_mon, tx_hash)
       VALUES (?, ?, ?, ?)`,
      [packageId, buyerAddress, amountMon, txHash],
    );

    db.run(
      `UPDATE packages SET times_sold = times_sold + 1 WHERE id = ?`,
      [packageId],
    );

    this.persist();
  }

  /** Update token address for a package (after launching on Nad.fun) */
  updateTokenInfo(
    packageId: string,
    tokenAddress: string,
    curveAddress: string,
  ): void {
    const db = this.getDb();
    db.run(
      `UPDATE packages SET token_address = ?, curve_address = ? WHERE id = ?`,
      [tokenAddress, curveAddress, packageId],
    );
    this.persist();
  }

  /** Get sales history for a package */
  getSales(packageId: string): SaleRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT * FROM transactions WHERE package_id = ? ORDER BY id DESC`,
    );
    stmt.bind([packageId]);

    const results: SaleRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as number,
        packageId: row.package_id as string,
        buyerAddress: row.buyer_address as string,
        amountMon: row.amount_mon as number,
        txHash: row.tx_hash as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Get all transactions for a buyer address */
  getTransactionsByBuyer(buyerAddress: string): SaleRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT * FROM transactions WHERE buyer_address = ? ORDER BY id DESC`,
    );
    stmt.bind([buyerAddress]);

    const results: SaleRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as number,
        packageId: row.package_id as string,
        buyerAddress: row.buyer_address as string,
        amountMon: row.amount_mon as number,
        txHash: row.tx_hash as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Get all transactions (recent first) */
  getAllTransactions(limit: number = 50): SaleRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT * FROM transactions ORDER BY id DESC LIMIT ?`,
    );
    stmt.bind([limit]);

    const results: SaleRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as number,
        packageId: row.package_id as string,
        buyerAddress: row.buyer_address as string,
        amountMon: row.amount_mon as number,
        txHash: row.tx_hash as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Get total number of packages */
  getPackageCount(): number {
    const db = this.getDb();
    const result = db.exec("SELECT COUNT(*) FROM packages");
    if (result.length === 0) return 0;
    return result[0].values[0][0] as number;
  }

  /** Delete a package listing */
  deletePackage(id: string): boolean {
    const db = this.getDb();
    const before = this.getPackageCount();
    db.run("DELETE FROM packages WHERE id = ?", [id]);
    this.persist();
    return this.getPackageCount() < before;
  }

  // === Bounties ===

  /** Post a knowledge bounty */
  postBounty(topic: string, rewardMon: number, requester: string): string {
    const db = this.getDb();
    const id = `bounty-${Date.now().toString(36)}`;

    db.run(
      `INSERT INTO bounties (id, topic, reward_mon, requester, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [id, topic, rewardMon, requester],
    );

    this.persist();
    return id;
  }

  /** Get all open bounties */
  getOpenBounties(): BountyRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT * FROM bounties WHERE status = 'open' ORDER BY reward_mon DESC`,
    );

    const results: BountyRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        topic: row.topic as string,
        rewardMon: row.reward_mon as number,
        requester: row.requester as string,
        fulfiller: (row.fulfiller as string) ?? null,
        status: row.status as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Fulfill a bounty */
  fulfillBounty(bountyId: string, fulfiller: string): boolean {
    const db = this.getDb();
    db.run(
      `UPDATE bounties SET status = 'fulfilled', fulfiller = ? WHERE id = ? AND status = 'open'`,
      [fulfiller, bountyId],
    );
    this.persist();
    // Check if update was successful
    const stmt = db.prepare(`SELECT status FROM bounties WHERE id = ?`);
    stmt.bind([bountyId]);
    const fulfilled = stmt.step() && (stmt.getAsObject().status as string) === "fulfilled";
    stmt.free();
    return fulfilled;
  }

  // === Ratings ===

  /** Rate a package */
  ratePackage(
    packageId: string,
    raterAddress: string,
    stars: number,
    comment: string = "",
  ): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO ratings (package_id, rater_address, stars, comment)
       VALUES (?, ?, ?, ?)`,
      [packageId, raterAddress, stars, comment],
    );
    this.persist();
  }

  /** Get average rating for a package */
  getPackageRating(packageId: string): PackageRating | null {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE package_id = ?`,
    );
    stmt.bind([packageId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject();
    stmt.free();

    if (!row.count || row.count === 0) return null;

    return {
      avg: row.avg as number,
      count: row.count as number,
    };
  }

  /** Get all ratings for a package */
  getPackageRatings(packageId: string): RatingRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      `SELECT * FROM ratings WHERE package_id = ? ORDER BY id DESC`,
    );
    stmt.bind([packageId]);

    const results: RatingRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as number,
        packageId: row.package_id as string,
        raterAddress: row.rater_address as string,
        stars: row.stars as number,
        comment: row.comment as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Close the database */
  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
    }
  }

  /** Convert a raw row object to PackageListing */
  private rowToListing(row: Record<string, unknown>): PackageListing {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      tags: row.tags as string,
      priceMon: row.price_mon as number,
      tokenAddress: (row.token_address as string) ?? null,
      curveAddress: (row.curve_address as string) ?? null,
      creatorAddress: (row.creator_address as string) ?? null,
      packagePath: row.package_path as string,
      fileCount: row.file_count as number,
      chunkCount: row.chunk_count as number,
      entityCount: row.entity_count as number,
      timesSold: row.times_sold as number,
      createdAt: row.created_at as string,
    };
  }
}
