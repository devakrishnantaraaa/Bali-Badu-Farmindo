import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const product_id = searchParams.get('product_id');

    let queryText = `
      SELECT sm.id, sm.created_at, sm.product_id, p.name AS product_name, p.unit, p.price_per_unit, sm.movement_type, 
             sm.quantity, 
             COALESCE(sm.damaged_qty, 0) AS damaged_qty, 
             sm.physical_stock, 
             COALESCE(sm.adjustment_qty, 0) AS adjustment_qty,
             sm.balance_after, sm.reference_id, sm.notes
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
    `;
    const params: any[] = [];

    if (product_id && product_id !== 'ALL' && product_id !== 'undefined' && product_id !== 'null') {
      queryText += ` WHERE sm.product_id = $1`;
      params.push(product_id);
    }

    queryText += ` ORDER BY sm.created_at ASC, sm.id ASC LIMIT 2000`;

    const result = await pool.query(queryText, params);
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

