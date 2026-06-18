import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pool } from './database';
import { logger } from '../utils/logger';

dotenv.config();

async function runMigrations() {
  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, '../../sql/schema.sql');
    const flowsPath = path.join(__dirname, '../../sql/flows_schema.sql');
    await client.query(fs.readFileSync(schemaPath, 'utf-8'));
    await client.query(fs.readFileSync(flowsPath, 'utf-8'));
    logger.info('Migraciones ejecutadas correctamente');
  } catch (error) {
    logger.error('Error ejecutando migraciones:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
