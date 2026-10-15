import React, { useEffect, useRef, useState } from "react";
import {
  PRODUCTS,
  TEAM,
  STAGES,
  addressLabel,
  dateLabel,
  money,
  newVisit,
  recordVisit,
  today,
} from "../lib/domain.mjs";
import { AddressFields, ContactPicker, Field, Icon, Select } from "./ui.jsx";

async function preparePhoto(file) {
  if (!file.type.startsWith("image/"))
    throw new Error("Selecione um arquivo de imagem.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Cada foto pode ter até 12 MB.");
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      url: canvas.toDataURL("image/jpeg", 0.82),
    };
  } finally {
    image.close();
  }
}

export default function VisitForm({
  data,
  userId,
  save,
  plan,
  onSaved,
  onDirty,
}) {
  const initial = () => {
    const base = newVisit(userId);
    const work = data.works.find((item) => item.id === plan?.workId);
    return work
      ? {
          ...base,
          ...work,
          workId: work.id,
          workName: work.name,
          planId: plan.id,
          userId: plan.userId,
          contractorQuery:
            data.contacts.find((item) => item.id === work.contractorId)?.name ||
            "",
          architectQuery:
            data.contacts.find((item) => item.id === work.architectId)?.name ||
            "",
        }
      : base;
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const errorRef = useRef(null);
  const photoRef = useRef(null);
  const cameraRef = useRef(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current && form.userId !== userId && !plan)
      setForm((current) => ({ ...current, userId }));
  }, [userId, plan]);
  const update = (patch) => {
    dirty.current = true;
    onDirty(true);
    setForm((current) => ({ ...current, ...patch }));
  };
  const change = (key) => (event) => update({ [key]: event.target.value });
  const chooseWork = (id) => {
    const work = data.works.find((item) => item.id === id);
    if (!work) {
      const empty = newVisit(form.userId);
      update(
        Object.fromEntries(
          [
            "workId",
            "workName",
            "street",
            "number",
            "cep",
            "neighborhood",
            "city",
            "state",
            "complement",
            "responsible",
            "phone",
            "contractorId",
            "architectId",
            "contractorQuery",
            "architectQuery",
          ].map((key) => [key, empty[key] || ""]),
        ),
      );
      return;
    }
    update({
      ...work,
      workId: work.id,
      workName: work.name,
      contractorQuery:
        data.contacts.find((item) => item.id === work.contractorId)?.name || "",
      architectQuery:
        data.contacts.find((item) => item.id === work.architectId)?.name || "",
    });
  };
  const offered = (product, checked) =>
    update({
      offered: checked
        ? [...form.offered, product]
        : form.offered.filter((item) => item !== product),
      sold: checked ? form.sold : form.sold.filter((item) => item !== product),
    });
  const upload = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    if (form.photos.length + files.length > 6)
      return setError("Adicione no máximo 6 fotos por visita.");
    setPhotoBusy(true);
    setError("");
    try {
      const photos = await Promise.all(files.map(preparePhoto));
      update({ photos: [...form.photos, ...photos] });
    } catch (cause) {
      setError(
        cause.message ||
          "Não foi possível abrir a foto. Use uma imagem JPG, PNG ou WebP.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (form.contractorQuery?.trim() && !form.contractorId)
        throw new Error(
          "Selecione o empreiteiro na lista ou use + para cadastrá-lo.",
        );
      if (form.architectQuery?.trim() && !form.architectId)
        throw new Error(
          "Selecione o arquiteto na lista ou use + para cadastrá-lo.",
        );
      setBusy(true);
      await save(
        (current) => recordVisit(current, form),
        "Visita registrada com sucesso.",
      );
      dirty.current = false;
      onDirty(false);
      setForm(newVisit(userId));
      onSaved();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause.message);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="visit-layout">
      <form className="visit-form" onSubmit={submit}>
        {plan?.id && (
          <div className="notice">
            <Icon name="calendar" />
            <span>
              Registrando a visita programada para {dateLabel(plan.date)}.
            </span>
          </div>
        )}
        <section className="panel form-section">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2>A obra e a visita</h2>
              <p>Um novo endereço. Muitas possibilidades.</p>
            </div>
            <Icon name="building" />
          </div>
          <div className="fields two">
            <Field
              label="Data da visita"
              type="date"
              value={form.date}
              onChange={change("date")}
              max={today()}
              required
            />
            <Select
              label="Colaborador"
              value={form.userId}
              onChange={(userId) => update({ userId })}
              required
            >
              {TEAM.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          {data.works.length > 0 && (
            <Select
              label="Vincular a uma obra existente"
              value={form.workId}
              onChange={chooseWork}
            >
              <option value="">Cadastrar uma nova obra nesta visita</option>
              {data.works.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.neighborhood}
                </option>
              ))}
            </Select>
          )}
          <div className="fields two">
            <Field
              label="Nome / identificação da obra"
              placeholder="Ex.: Residência da Rua das Palmeiras"
              value={form.workName}
              onChange={change("workName")}
              required
              maxLength={180}
            />
            <fieldset className="field">
              <legend>
                Tipo de obra <span className="required">*</span>
              </legend>
              <div className="segmented">
                {["Residencial", "Comercial"].map((type) => (
                  <label
                    className={form.type === type ? "selected" : ""}
                    key={type}
                  >
                    <input
                      type="radio"
                      name="work-type"
                      checked={form.type === type}
                      onChange={() => update({ type })}
                    />
                    <Icon
                      name={type === "Residencial" ? "building" : "box"}
                      size={17}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <h2>Onde vamos transformar?</h2>
              <p>O bairro ajuda a encontrar as melhores oportunidades.</p>
            </div>
            <Icon name="visit" />
          </div>
          <AddressFields value={form} onChange={(next) => update(next)} />
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <span className="section-number">03</span>
            <div>
              <h2>Pessoas e conexões</h2>
              <p>Quem está construindo essa história com a gente?</p>
            </div>
            <Icon name="users" />
          </div>
          <div className="fields two">
            <Field
              label="Responsável pela obra"
              value={form.responsible}
              onChange={change("responsible")}
              placeholder="Se conhecido, informe o nome"
              maxLength={180}
            />
            <Field
              label="Telefone de contato"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={change("phone")}
              placeholder="(00) 00000-0000"
              maxLength={25}
              hint="Pode ser preenchido depois, caso ainda não saiba."
            />
          </div>
          <div className="fields two">
            <ContactPicker
              label="Empreiteiro"
              role="contractor"
              data={data}
              save={save}
              value={form.contractorId}
              query={form.contractorQuery || ""}
              onQuery={(contractorQuery) => update({ contractorQuery })}
              onChange={(contractorId, contractorQuery) =>
                update({ contractorId, contractorQuery })
              }
            />
            <ContactPicker
              label="Arquiteto"
              role="architect"
              data={data}
              save={save}
              value={form.architectId}
              query={form.architectQuery || ""}
              onQuery={(architectQuery) => update({ architectQuery })}
              onChange={(architectId, architectQuery) =>
                update({ architectId, architectQuery })
              }
            />
          </div>
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <span className="section-number">04</span>
            <div>
              <h2>Produtos e oportunidades</h2>
              <p>Marque o que foi oferecido e sinalize as vendas.</p>
            </div>
            <Icon name="box" />
          </div>
          <div className="product-legend">
            <span>
              <i className="dot offered" />
              Oferecido / prospectado
            </span>
            <span>
              <i className="dot sold" />
              Vendido
            </span>
          </div>
          <div className="product-grid">
            {PRODUCTS.map((product, index) => {
              const selected = form.offered.includes(product);
              const sold = form.sold.includes(product);
              return (
                <div
                  className={`product-option ${selected ? "selected" : ""} ${sold ? "is-sold" : ""}`}
                  key={product}
                >
                  <label className="product-choice">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        offered(product, event.target.checked)
                      }
                      aria-label={`Oferecer ${product}`}
                    />
                    <span className="product-symbol">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{product}</span>
                  </label>
                  {selected && (
                    <label className="sold-choice">
                      <input
                        type="checkbox"
                        checked={sold}
                        aria-label={`Vendeu ${product}`}
                        onChange={(event) =>
                          update({
                            sold: event.target.checked
                              ? [...form.sold, product]
                              : form.sold.filter((item) => item !== product),
                          })
                        }
                      />
                      {sold ? "Vendido" : "Marcar venda"}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div className="fields two">
            <Select
              label="Tipo de visita"
              value={form.sold.length ? "closing" : form.stage}
              onChange={(stage) => update({ stage })}
            >
              {Object.entries(STAGES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Field
              label="Valor total vendido (R$)"
              type="number"
              min="0"
              step="0.01"
              value={form.saleValue}
              onChange={change("saleValue")}
              placeholder="0,00"
              hint="Opcional. Valor total da visita."
            />
          </div>
          <Field label="O que foi conversado / oferecido?">
            <textarea
              value={form.notes}
              onChange={change("notes")}
              rows={3}
              maxLength={4000}
              placeholder="Interesses, necessidades e detalhes que ajudam no próximo contato…"
            />
          </Field>
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <span className="section-number">05</span>
            <div>
              <h2>Um olhar sobre a obra</h2>
              <p>Registre o momento e prepare o próximo passo.</p>
            </div>
            <Icon name="camera" />
          </div>
          <div className="photo-upload">
            <div className="photo-upload-icon">
              <Icon name="camera" size={28} />
            </div>
            <strong>
              {photoBusy
                ? "Preparando suas fotos…"
                : "Mostre o potencial desse projeto"}
            </strong>
            <p>Fotografe a obra ou adicione imagens da galeria.</p>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                disabled={photoBusy}
                onClick={() => cameraRef.current.click()}
              >
                <Icon name="camera" size={17} />
                Tirar foto
              </button>
              <button
                type="button"
                className="button text-button"
                disabled={photoBusy}
                onClick={() => photoRef.current.click()}
              >
                Escolher arquivos
                <Icon name="arrow" size={16} />
              </button>
            </div>
            <small>Até 6 fotos · JPG, PNG ou WebP · 12 MB por arquivo</small>
            <input
              hidden
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={upload}
              aria-label="Selecionar fotos da obra"
            />
            <input
              hidden
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={upload}
              aria-label="Fotografar obra"
            />
          </div>
          {!!form.photos.length && (
            <div className="photo-grid">
              {form.photos.map((photo) => (
                <figure key={photo.id}>
                  <img src={photo.url} alt={`Foto da obra: ${photo.name}`} />
                  <button
                    type="button"
                    aria-label={`Remover ${photo.name}`}
                    onClick={() =>
                      update({
                        photos: form.photos.filter(
                          (item) => item.id !== photo.id,
                        ),
                      })
                    }
                  >
                    <Icon name="close" size={15} />
                  </button>
                </figure>
              ))}
            </div>
          )}
          <Field label="Próxima ação">
            <textarea
              rows={2}
              value={form.nextAction}
              onChange={change("nextAction")}
              placeholder="Ex.: enviar orçamento de forro e retomar contato na sexta-feira"
              maxLength={2000}
            />
          </Field>
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={form.scheduleNext}
              onChange={(event) =>
                update({ scheduleNext: event.target.checked })
              }
            />
            <Icon name="calendar" />
            <span>
              <strong>Programar uma próxima visita</strong>
              <small>Deixe o retorno organizado na sua agenda.</small>
            </span>
          </label>
          {form.scheduleNext && (
            <Field
              label="Data do retorno"
              type="date"
              min={today()}
              required
              value={form.nextDate}
              onChange={change("nextDate")}
            />
          )}
        </section>
        {error && (
          <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </div>
        )}
        <div className="form-footer">
          <p>
            <Icon name="info" size={16} />
            <span>
              Campos com <b>*</b> são obrigatórios.
            </span>
          </p>
          <button
            className="button primary save-visit"
            disabled={busy || photoBusy}
          >
            <Icon name="check" size={19} />
            {busy ? "Salvando visita…" : "Registrar visita"}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
      <aside className="visit-aside">
        <div className="summary-card">
          <div className="summary-title">
            <Icon name="visit" />
            <h3>Sua visita, em resumo</h3>
          </div>
          <div className="summary-work">
            <span className="eyebrow">OBRA</span>
            <strong>{form.workName || "Um novo projeto começa aqui"}</strong>
            <p>
              {form.neighborhood
                ? `${form.neighborhood}${form.city ? ` · ${form.city}` : ""}`
                : "Adicione o endereço da obra"}
            </p>
          </div>
          <dl>
            <div>
              <dt>Data</dt>
              <dd>{dateLabel(form.date)}</dd>
            </div>
            <div>
              <dt>Colaborador</dt>
              <dd>{TEAM.find((item) => item.id === form.userId)?.name}</dd>
            </div>
            <div>
              <dt>Tipo de obra</dt>
              <dd>{form.type}</dd>
            </div>
          </dl>
          <div className="summary-products">
            <div>
              <strong>{form.offered.length.toString().padStart(2, "0")}</strong>
              <span>produtos oferecidos</span>
            </div>
            <div>
              <strong>{form.sold.length.toString().padStart(2, "0")}</strong>
              <span>produtos vendidos</span>
            </div>
          </div>
          {form.sold.length > 0 && (
            <div className="summary-value">
              <span>Valor da venda</span>
              <strong>{money(form.saleValue)}</strong>
            </div>
          )}
          <div className="summary-tip">
            <Icon name="info" size={17} />
            <p>
              A obra será salva junto com a visita. Você poderá encontrá-la em{" "}
              <b>Obras</b>.
            </p>
          </div>
        </div>
        <div className="brand-card">
          <div className="architecture-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span />
          </div>
          <span className="eyebrow">CONEXÕES QUE CONSTROEM</span>
          <h3>Grandes ambientes começam com uma boa conversa.</h3>
          <p>Cada visita aproxima a FAMAC do próximo projeto.</p>
          <span className="brand-line" />
        </div>
        <div className="aside-help">
          <Icon name="check" size={16} />
          <p>
            Empreiteiro ou arquiteto novo?
            <br />
            <strong>Cadastre sem sair da visita.</strong>
          </p>
        </div>
      </aside>
    </div>
  );
}
