import React, { useEffect, useRef, useState } from "react";
import { repository } from "../lib/repository.mjs";
import { MAX_PRODUCT_PHOTOS, preparePhoto } from "../lib/photo.mjs";
import { Icon, Modal } from "./ui.jsx";
import "../product-photos.css";

export function ProductImage({ photo, alt, eager = false, retry = true }) {
  const [url, setUrl] = useState(photo.key ? "" : photo.url);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(photo.key ? "" : photo.url);
    setError(false);
    repository
      .photoUrl(photo, attempt > 0)
      .then((next) => {
        if (active) setUrl(next);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [photo.id, photo.key, photo.url, attempt]);
  if (error)
    return (
      <span className="product-image-status" role="status">
        <Icon name="camera" size={24} />
        <span>Não foi possível carregar a foto.</span>
        {retry && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar novamente
          </button>
        )}
      </span>
    );
  return url ? (
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      onError={() => setError(true)}
    />
  ) : (
    <span className="product-image-status" role="status">
      <Icon name="camera" size={24} />
      Carregando foto…
    </span>
  );
}

export function ProductGallery({ product, onClose }) {
  const photos = product.photos || [];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const key = (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((value) => Math.min(photos.length - 1, value + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [photos.length]);
  if (!photos.length) return null;
  return (
    <Modal title={product.name} onClose={onClose} wide>
      <section
        className="product-gallery"
        aria-label={`Apresentação de ${product.name}`}
      >
        <div className="product-gallery-stage">
          <ProductImage
            key={photos[index].id}
            photo={photos[index]}
            alt={`${product.name} — foto ${index + 1}`}
            eager
          />
        </div>
        <div className="product-gallery-navigation">
          <button
            type="button"
            className="button secondary"
            aria-label="Foto anterior"
            disabled={!index}
            onClick={() => setIndex(index - 1)}
          >
            <Icon name="chevron" className="gallery-previous" size={18} />
            Anterior
          </button>
          <span role="status" aria-live="polite">
            Foto <strong>{index + 1}</strong> de {photos.length}
          </span>
          <button
            type="button"
            className="button secondary"
            aria-label="Próxima foto"
            disabled={index === photos.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            Próxima
            <Icon name="chevron" size={18} />
          </button>
        </div>
        {photos.length > 1 && (
          <div
            className="product-gallery-thumbnails"
            role="group"
            aria-label="Fotos do produto"
          >
            {photos.map((photo, position) => (
              <button
                type="button"
                key={photo.id}
                aria-label={`Mostrar foto ${position + 1} de ${product.name}`}
                aria-pressed={index === position}
                onClick={() => setIndex(position)}
              >
                <ProductImage
                  photo={photo}
                  alt={`Miniatura ${position + 1}`}
                  retry={false}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}

export function ProductPhotoEditor({ photos, onChange, onBusy, disabled }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const add = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    setError("");
    if (photos.length + files.length > MAX_PRODUCT_PHOTOS)
      return setError("Adicione no máximo 6 fotos por produto.");
    setLoading(true);
    onBusy(true);
    try {
      onChange([...photos, ...(await Promise.all(files.map(preparePhoto)))]);
    } catch (cause) {
      setError(
        cause.message || "Não foi possível abrir a foto. Use JPG, PNG ou WebP.",
      );
    } finally {
      setLoading(false);
      onBusy(false);
    }
  };
  return (
    <section className="product-photo-editor" aria-label="Fotos do produto">
      <div className="product-photo-editor-heading">
        <div>
          <h3>Fotos do produto</h3>
          <p>
            A primeira foto será a capa. Adicione até 6 imagens para apresentar
            aos clientes.
          </p>
        </div>
        <span>{photos.length}/6</span>
      </div>
      {!!photos.length && (
        <div className="product-photo-previews">
          {photos.map((photo, index) => (
            <article key={photo.id}>
              <div className="product-photo-preview-image">
                <ProductImage
                  photo={photo}
                  alt={`Foto ${index + 1} do produto`}
                />
                {!index && <span className="product-cover-label">Capa</span>}
              </div>
              <div className="product-photo-preview-actions">
                {index > 0 && (
                  <button
                    type="button"
                    className="button text-button"
                    disabled={disabled || loading}
                    onClick={() =>
                      onChange([
                        photo,
                        ...photos.filter((item) => item.id !== photo.id),
                      ])
                    }
                  >
                    Usar como capa
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button delete-action"
                  disabled={disabled || loading}
                  aria-label={`Remover foto ${index + 1}`}
                  onClick={() =>
                    onChange(photos.filter((item) => item.id !== photo.id))
                  }
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={add}
        aria-label="Selecionar fotos do produto"
        hidden
      />
      <button
        type="button"
        className="button secondary product-add-photos"
        disabled={disabled || loading || photos.length >= MAX_PRODUCT_PHOTOS}
        onClick={() => input.current.click()}
      >
        <Icon name="camera" size={18} />
        {loading ? "Preparando fotos…" : "Adicionar fotos"}
      </button>
      {!photos.length && (
        <p className="product-photo-help">
          Mostre detalhes do acabamento ou ambientes onde o produto foi
          aplicado.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
