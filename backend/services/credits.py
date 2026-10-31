from uuid import UUID, uuid4

from fastapi import HTTPException

QUESTION_COST = 5
NEW_DATA_COST = 10
STARTING_CREDITS = 100


async def check_and_deduct_credits(connection, user_id: UUID, amount: int, action: str) -> int:
    """Atomically verify and deduct credits for a user.

    Raises HTTP 402 if user does not have enough credits.
    """
    row = await connection.fetchrow(
        """UPDATE chat_olap.users
           SET credits = credits - $1
           WHERE id = $2 AND credits >= $1
           RETURNING credits""",
        amount,
        user_id,
    )
    if not row:
        current = await connection.fetchval(
            "SELECT credits FROM chat_olap.users WHERE id = $1", user_id
        )
        balance = current if current is not None else 0
        raise HTTPException(
            402,
            f"Insufficient credits. This action costs {amount} credits, but your current balance is {balance}.",
        )
    balance_after = row["credits"]
    await connection.execute(
        """INSERT INTO chat_olap.credit_transactions(id, user_id, amount, action, balance_after)
           VALUES($1, $2, $3, $4, $5)""",
        uuid4(),
        user_id,
        -amount,
        action,
        balance_after,
    )
    return balance_after


async def add_credits(connection, user_id: UUID, amount: int, action: str) -> int:
    """Add credits to a user balance and record transaction."""
    row = await connection.fetchrow(
        """UPDATE chat_olap.users
           SET credits = credits + $1
           WHERE id = $2
           RETURNING credits""",
        amount,
        user_id,
    )
    balance_after = row["credits"] if row else amount
    await connection.execute(
        """INSERT INTO chat_olap.credit_transactions(id, user_id, amount, action, balance_after)
           VALUES($1, $2, $3, $4, $5)""",
        uuid4(),
        user_id,
        amount,
        action,
        balance_after,
    )
    return balance_after


async def get_user_credits_data(connection, user_id: UUID, limit: int = 20):
    """Retrieve current credit balance and recent transactions."""
    credits = await connection.fetchval(
        "SELECT credits FROM chat_olap.users WHERE id = $1", user_id
    )
    transactions = await connection.fetch(
        """SELECT id, amount, action, balance_after, created_at
           FROM chat_olap.credit_transactions
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2""",
        user_id,
        limit,
    )
    return {
        "credits": credits if credits is not None else STARTING_CREDITS,
        "question_cost": QUESTION_COST,
        "new_data_cost": NEW_DATA_COST,
        "transactions": [dict(t) for t in transactions],
    }
