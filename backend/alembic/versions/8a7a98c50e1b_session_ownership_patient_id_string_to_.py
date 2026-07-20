"""session ownership: patient_id string to patientprofile FK

Replaces the client-supplied `patient_id` string with a real foreign key to
patientprofile. The old column was accepted from the request body and used
verbatim as a query filter, so any caller could read or write any patient's
records by naming them.

Rows recorded before authentication existed all carry the placeholder
'default' and have no real owner. They are left with a NULL owner rather than
being attached to a fabricated account; the API shows unowned sessions to
admins only.

Revision ID: 8a7a98c50e1b
Revises: 734e508c26bf
Create Date: 2026-07-20 21:37:06.761299

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8a7a98c50e1b'
down_revision: Union[str, None] = '734e508c26bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Named explicitly so downgrade can drop it; autogenerate emits None, which
# fails at runtime.
FK_NAME = "fk_rehabsession_patient_profile_id_patientprofile"


def upgrade() -> None:
    op.add_column(
        'rehabsession',
        sa.Column('patient_profile_id', sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f('ix_rehabsession_patient_profile_id'),
        'rehabsession',
        ['patient_profile_id'],
        unique=False,
    )
    op.create_foreign_key(
        FK_NAME,
        'rehabsession',
        'patientprofile',
        ['patient_profile_id'],
        ['id'],
    )

    # Guard against dropping real ownership data. Only the 'default'
    # placeholder is safe to discard; anything else means this database has
    # data this migration was not designed for.
    conn = op.get_bind()
    unexpected = conn.execute(
        sa.text(
            "SELECT DISTINCT patient_id FROM rehabsession "
            "WHERE patient_id IS NOT NULL AND patient_id <> 'default'"
        )
    ).scalars().all()
    if unexpected:
        raise RuntimeError(
            "rehabsession.patient_id holds values other than 'default': "
            f"{unexpected}. Map them to patientprofile rows before running "
            "this migration, or it will discard them."
        )

    op.drop_index('ix_rehabsession_patient_id', table_name='rehabsession')
    op.drop_column('rehabsession', 'patient_id')


def downgrade() -> None:
    # Nullable with a server default: existing rows have no string id to
    # restore, and a bare NOT NULL add would fail against them.
    op.add_column(
        'rehabsession',
        sa.Column(
            'patient_id',
            sa.VARCHAR(),
            nullable=False,
            server_default='default',
        ),
    )
    op.create_index(
        'ix_rehabsession_patient_id', 'rehabsession', ['patient_id'], unique=False
    )
    op.drop_constraint(FK_NAME, 'rehabsession', type_='foreignkey')
    op.drop_index(
        op.f('ix_rehabsession_patient_profile_id'), table_name='rehabsession'
    )
    op.drop_column('rehabsession', 'patient_profile_id')
