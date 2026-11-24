/* PostgreSQL：连接池、事务（表结构由 migrations/ 下的迁移文件管理，见 README） */
import pg from 'pg';

// bigint（毫秒时间戳、COUNT）与 numeric（AVG）默认按字符串返回，前端要数字
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export function createDb(databaseUrl, max = 10) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max });
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    /* 事务：回调里用传入的 client 查询，抛错自动回滚 */
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { c.release(); }
    },
    end: () => pool.end(),
  };
}
