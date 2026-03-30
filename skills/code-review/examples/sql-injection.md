# Example: SQL Injection Review

**Input code:**
```python
def get_user(name):
    query = f"SELECT * FROM users WHERE name = '{name}'"
    return db.execute(query)
```

**Review output:**

## Summary
- **Files reviewed**: 1
- **Issues found**: 1 Critical, 0 Warning, 0 Info

## Issues

### [Critical] SQL Injection via string interpolation
- **Location**: app.py:2
- **Problem**: User input `name` is directly interpolated into SQL query without parameterization. Attacker can inject `'; DROP TABLE users; --` to execute arbitrary SQL.
- **Fix**: Use parameterized queries: `db.execute("SELECT * FROM users WHERE name = ?", [name])`

## Verdict
REQUEST CHANGES
