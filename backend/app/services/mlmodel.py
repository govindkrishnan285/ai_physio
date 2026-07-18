"""Optional TensorFlow layer: an LSTM autoencoder trained ONLY on correct reps.

This is one-class / anomaly detection, not classification. Reference videos give
us only correct examples, so we teach the network to reconstruct correct
movement; a live rep that reconstructs poorly (high error) is flagged as far from
the learned-correct manifold. The DTW engine works without any of this — the
autoencoder is a complementary learned quality score, enabled via ENABLE_TF.

TensorFlow is imported lazily so the rest of the backend runs (and imports)
without it installed.
"""

from __future__ import annotations

import numpy as np

ANGLE_SCALE = 180.0  # features are degrees; scale to ~[0,1] for training stability


def is_available() -> bool:
    try:
        import tensorflow  # noqa: F401

        return True
    except Exception:
        return False


def _build_autoencoder(seq_len: int, n_features: int):
    from tensorflow import keras
    from tensorflow.keras import layers

    inputs = keras.Input(shape=(seq_len, n_features))
    # Encoder
    x = layers.LSTM(64, activation="tanh", return_sequences=False)(inputs)
    latent = layers.Dense(16, activation="tanh")(x)
    # Decoder
    x = layers.RepeatVector(seq_len)(latent)
    x = layers.LSTM(64, activation="tanh", return_sequences=True)(x)
    outputs = layers.TimeDistributed(layers.Dense(n_features))(x)

    model = keras.Model(inputs, outputs)
    model.compile(optimizer="adam", loss="mse")
    return model


def _reconstruction_errors(model, data: np.ndarray) -> np.ndarray:
    preds = model.predict(data, verbose=0)
    # Mean squared error per sample across time and features.
    return np.mean((preds - data) ** 2, axis=(1, 2))


def train_autoencoder(
    rep_matrices: list[np.ndarray],
    model_path: str,
    *,
    epochs: int = 60,
    batch_size: int = 8,
) -> float:
    """Train on normalized reference reps; return an anomaly-error threshold.

    Threshold = mean + 2*std of the training reconstruction errors: reps well
    outside the correct distribution score above it.
    """
    data = np.stack(rep_matrices, axis=0) / ANGLE_SCALE
    seq_len, n_features = data.shape[1], data.shape[2]

    model = _build_autoencoder(seq_len, n_features)
    model.fit(
        data,
        data,
        epochs=epochs,
        batch_size=min(batch_size, len(data)),
        shuffle=True,
        verbose=0,
    )
    model.save(model_path)

    errs = _reconstruction_errors(model, data)
    return float(errs.mean() + 2.0 * errs.std())


def anomaly_score(model_path: str, user_norm: np.ndarray) -> float:
    """Reconstruction error for one normalized (seq_len, F) user rep."""
    from tensorflow import keras

    model = keras.models.load_model(model_path)
    data = (user_norm / ANGLE_SCALE)[None, ...]
    return float(_reconstruction_errors(model, data)[0])
