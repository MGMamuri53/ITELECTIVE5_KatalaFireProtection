import { useEffect, useMemo, useRef, useState } from 'react'
import { Nav, Footer, PageIntro, InfoNote } from './components'
import { catalog, categories } from './data/catalog'
import { isSignedIn, schemaApi } from './services/katalaApi'

import extinguisherImage from './assets/pictures/06a07516-5478-4ffa-8cc9-27c057371c58.jpg'
import detectorImage from './assets/pictures/d46f04a1-bcd1-4ea9-80c4-a2c23f357a63.jpg'
import pumpImage from './assets/pictures/download (1).jpg'
import facilityImage from './assets/pictures/94423466-9af4-4ef6-a238-a24c98a65c1e.jpg'

const CART_KEY = 'katala-cart-v3'
const QUOTATION_REFS_KEY = 'katala-quotation-refs-v1'
const emptyCheckout = {
  projectName: '',
  establishmentName: '',
  projectDescription: '',
  projectAddress: '',
  customerRemarks: '',
}

const imageByCategory = {
  'Fire Extinguishers': extinguisherImage,
  'Cabinets & Fittings': facilityImage,
  'Fire Alarm & Detection': detectorImage,
  'Fire Pumps': pumpImage,
}

function productImage(product) {
  return imageByCategory[product.category] || facilityImage
}

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function normalizeCart(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((line) => catalog.some((product) => product.id === line.productId))
    .map((line) => ({
      productId: String(line.productId),
      variant: typeof line.variant === 'string' ? line.variant : '',
      quantity: Math.min(999, Math.max(1, Number.parseInt(line.quantity, 10) || 1)),
    }))
}

function lineKey(productId, variant) {
  return `${productId}::${variant || ''}`
}

function dbSafeModel(model) {
  if (!model || /not clearly legible|project\/configuration based/i.test(model)) return ''
  return model
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

function formatPeso(value) {
  return peso.format(Number(value || 0))
}

function displayQuotationStatus(status) {
  if (status === 'Accepted') return 'Ready for Payment'
  return status === 'Submitted' ? 'Under Review' : (status || 'Under Review')
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function stockLabel(product, materials) {
  if (!materials.length) return 'Database stock: checking availability on submission'
  const matches = materials.filter((material) => {
    const sameName = normalizeKey(material.name) === normalizeKey(product.name)
    const sameModel = !dbSafeModel(product.model) || normalizeKey(material.model) === normalizeKey(product.model)
    return sameName && sameModel
  })
  if (!matches.length) return 'Database stock: manual confirmation required'
  const knownStock = matches
    .map((item) => item.stock)
    .filter((value) => value !== null && value !== undefined)
  if (!knownStock.length) return 'Database stock: available for quotation'
  const total = knownStock.reduce((sum, value) => sum + Number(value || 0), 0)
  return `${total} unit${total === 1 ? '' : 's'} available in database`
}

export default function Products() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [dbMaterials, setDbMaterials] = useState([])
  const [catalogStatus, setCatalogStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [cart, setCart] = useState(() => normalizeCart(loadJson(CART_KEY, [])))
  const [quotationRefs, setQuotationRefs] = useState(() => loadJson(QUOTATION_REFS_KEY, []))
  const [pendingAdd, setPendingAdd] = useState(null)
  const [returnPaymentReference, setReturnPaymentReference] = useState('')

  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart])
  useEffect(() => localStorage.setItem(QUOTATION_REFS_KEY, JSON.stringify(quotationRefs)), [quotationRefs])

  useEffect(() => {
    let cancelled = false
    schemaApi.listCatalogMaterials()
      .then((data) => {
        if (cancelled) return
        setDbMaterials(data.materials || [])
        setCatalogStatus('')
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus('Database stock is unavailable; quotation quantities will still be checked when submitted.')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paidReference = params.get('payment_reference')
    const cancelledReference = params.get('payment_cancelled')
    const paymentReference = paidReference || cancelledReference
    if (!paymentReference) return

    params.delete('payment_reference')
    params.delete('payment_cancelled')
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || '#products'}`
    window.history.replaceState(null, '', nextUrl)

    setReturnPaymentReference(paymentReference)
    if (isSignedIn()) setManageOpen(true)
  }, [])

  const products = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesQuery = !q || [item.name, item.model, item.profileLabel, item.category, ...item.variants].join(' ').toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)

  function requestAddToCart(product, variant = '', quantity = 1, openCart = false, closeProduct = false) {
    const safeQuantity = Math.min(999, Math.max(1, Number.parseInt(quantity, 10) || 1))
    const safeVariant = product.variants.length ? (product.variants.includes(variant) ? variant : product.variants[0]) : ''
    setPendingAdd({ product, variant: safeVariant, quantity: safeQuantity, openCart, closeProduct })
  }

  function confirmAddToCart() {
    if (!pendingAdd) return
    addToCart(pendingAdd.product, pendingAdd.variant, pendingAdd.quantity, pendingAdd.openCart)
    if (pendingAdd.closeProduct) setSelected(null)
    setPendingAdd(null)
  }

  function addToCart(product, variant = '', quantity = 1, openCart = false) {
    const safeQuantity = Math.min(999, Math.max(1, Number.parseInt(quantity, 10) || 1))
    const safeVariant = product.variants.length ? (product.variants.includes(variant) ? variant : product.variants[0]) : ''
    const key = lineKey(product.id, safeVariant)

    setCart((current) => {
      const existing = current.findIndex((line) => lineKey(line.productId, line.variant) === key)
      if (existing === -1) return [...current, { productId: product.id, variant: safeVariant, quantity: safeQuantity }]
      return current.map((line, index) => index === existing ? { ...line, quantity: Math.min(999, line.quantity + safeQuantity) } : line)
    })

    if (openCart) setCartOpen(true)
  }

  function saveQuotationReference(referenceNumber) {
    if (!referenceNumber) return
    setQuotationRefs((current) => [
      { referenceNumber, savedAt: new Date().toISOString() },
      ...current.filter((item) => item.referenceNumber !== referenceNumber),
    ].slice(0, 10))
  }

  return (
    <>
      <Nav active="products" />
      <main>
        <PageIntro eyebrow="PRODUCT CATALOG" title="Fire protection products for quotation">
          Browse product types and listed options, compare specifications, and group the items you need into one quotation request. Final pricing and availability are confirmed by Katala.
        </PageIntro>

        <section className="section catalog-section">
          <div className="shell">
            <div className="catalog-controls">
              <label className="search-control">
                Search catalog
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Model, product, size…" />
              </label>
              <div className="category-pills" role="group" aria-label="Product category">
                {categories.map((item) => (
                  <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="catalog-toolbar">
              <div className="catalog-summary"><strong>{products.length}</strong> item{products.length === 1 ? '' : 's'} shown</div>
              <div className="catalog-actions">
                {quotationRefs.length > 0 && (
                  <button className="btn secondary compact-btn" type="button" onClick={() => { if (!isSignedIn()) { sessionStorage.setItem('katala-return-after-auth', 'products'); location.hash = 'signin'; return } setManageOpen(true) }}>
                    Manage quotation
                  </button>
                )}
                <button className="btn primary cart-button" type="button" onClick={() => setCartOpen(true)}>
                  Cart <span className="cart-count" aria-label={`${cartCount} items in cart`}>{cartCount}</span>
                </button>
              </div>
            </div>

            {products.length ? (
              <div className="catalog-grid">
                {products.map((item) => (
                  <article className="catalog-card" key={item.id}>
                    <button className="catalog-image" type="button" onClick={() => setSelected(item)} aria-label={`View ${item.name}`}>
                      <img src={productImage(item)} alt={item.name} />
                    </button>
                    <div className="catalog-card-body">
                      <span className="catalog-category">{item.category}</span>
                      <h2>{item.name}</h2>
                      <p className="model-line">{item.model}</p>
                      <div className="product-price">
                        <span>Estimated pricing</span>
                        <strong>For staff review</strong>
                      </div>
                      <p className="stock-line">{stockLabel(item, dbMaterials)}</p>
                      {item.variants.length > 0 && <p className="variant-preview">Shown options: {item.variants.join(', ')}</p>}
                      <div className="product-card-actions">
                        <button className="btn secondary full" type="button" onClick={() => setSelected(item)}>View specifications</button>
                        <button className="btn primary full" type="button" onClick={() => requestAddToCart(item, item.variants[0] || '', 1)}>Add to cart</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No matching product</h2>
                <p>Try another model, size, or category.</p>
                <button type="button" className="btn secondary" onClick={() => { setQuery(''); setCategory('All') }}>Reset filters</button>
              </div>
            )}

            <InfoNote title="Quotation cart">
              Add the products you want to review, adjust quantities in the cart, then submit one quotation request. Katala will confirm the final product configuration, pricing, and availability.
            </InfoNote>
            {catalogStatus && <div className="form-status loading">{catalogStatus}</div>}
          </div>
        </section>
      </main>
      <Footer />

      {selected && (
        <ProductModal
          product={selected}
          image={productImage(selected)}
          onClose={() => setSelected(null)}
          onAdd={(variant, quantity, openCart) => requestAddToCart(selected, variant, quantity, openCart, openCart)}
        />
      )}

      {cartOpen && (
        <CartModal
          cart={cart}
          setCart={setCart}
          onClose={() => setCartOpen(false)}
          onQuotationCreated={saveQuotationReference}
          onManageQuotation={() => {
            setCartOpen(false)
            setManageOpen(true)
          }}
        />
      )}

      {manageOpen && (
        <ManageQuotationModal
          quotationRefs={quotationRefs}
          setQuotationRefs={setQuotationRefs}
          initialPaymentReference={returnPaymentReference}
          onInitialPaymentHandled={() => setReturnPaymentReference('')}
          onClose={() => setManageOpen(false)}
        />
      )}

      {pendingAdd && (
        <AddToCartConfirmModal
          item={pendingAdd}
          onChange={(patch) =>
            setPendingAdd((current) => current ? { ...current, ...patch } : current)
          }
          onCancel={() => setPendingAdd(null)}
          onConfirm={confirmAddToCart}
        />
      )}
    </>
  )
}

function ProductModal({ product, image, onClose, onAdd }) {
  const [variant, setVariant] = useState(product.variants[0] || '')
  const [quantity, setQuantity] = useState(1)
  const closeRef = useRef(null)

  useEffect(() => {
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', listener)
    return () => {
      document.body.style.overflow = old
      window.removeEventListener('keydown', listener)
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-product-grid">
          <div className="modal-image">
            <img src={image} alt={product.name} />
            <span>Product category preview</span>
          </div>
          <div className="modal-copy">
            <span className="catalog-category">{product.category}</span>
            <h2 id="modal-title">{product.name}</h2>
            <div className="spec-list">
              <div><span>Model / reference</span><strong>{product.model}</strong></div>
              <div><span>Product description</span><strong>{product.profileLabel}</strong></div>
              <div><span>Listed options</span><strong>{product.variants.length ? product.variants.join(', ') : 'Configuration to be confirmed'}</strong></div>
              <div><span>Estimated price</span><strong>Final amount after staff review</strong></div>
              <div><span>Availability</span><strong>Confirm with Katala</strong></div>
            </div>

            <div className="honesty-box">
              <strong>Before requesting a quote</strong>
              <p>Include the intended application and any project-specific requirements so Katala can confirm the suitable configuration, supporting documents, availability, and final price.</p>
            </div>

            <div className="quick-cart-fields">
              {product.variants.length > 0 && (
                <label>
                  Option
                  <select value={variant} onChange={(e) => setVariant(e.target.value)}>
                    {product.variants.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              )}
              <label>
                Quantity
                <input type="number" min="1" max="999" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
            </div>

            <div className="modal-cart-actions">
              <button className="btn secondary" type="button" onClick={() => onAdd(variant, quantity, false)}>Add to cart</button>
              <button className="btn primary" type="button" onClick={() => onAdd(variant, quantity, true)}>Add & review cart</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function AddToCartConfirmModal({ item, onChange, onCancel, onConfirm }) {
  const closeRef = useRef(null)
  const variants = Array.isArray(item.product.variants) ? item.product.variants : []

  useEffect(() => {
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [onCancel])

  function updateQuantity(value) {
    // Allow the field to be edited naturally while keeping the final
    // quantity within the cart's supported 1–999 range.
    if (value === '') {
      onChange({ quantity: '' })
      return
    }

    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) return

    onChange({
      quantity: Math.min(999, Math.max(1, parsed)),
    })
  }

  function confirm() {
    const safeQuantity = Math.min(
      999,
      Math.max(1, Number.parseInt(item.quantity, 10) || 1)
    )

    if (safeQuantity !== item.quantity) {
      onChange({ quantity: safeQuantity })
    }

    onConfirm()
  }

  return (
    <div
      className="modal-backdrop cart-confirm-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <section
        className="product-modal cart-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-confirm-title"
      >
        <button
          ref={closeRef}
          className="modal-close"
          type="button"
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>

        <div className="cart-confirm-content">
          <span className="eyebrow">CONFIRM CART ITEM</span>
          <h2 id="cart-confirm-title">
            Confirm product option and quantity
          </h2>

          <div className="cart-confirm-product">
            <img src={productImage(item.product)} alt="" />
            <div>
              <strong>{item.product.name}</strong>
              <span>{item.product.model}</span>
            </div>
          </div>

          <div className="quick-cart-fields cart-confirm-fields">
            {variants.length > 0 && (
              <label>
                Option / Size
                <select
                  value={item.variant}
                  onChange={(e) => onChange({ variant: e.target.value })}
                >
                  {variants.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="999"
                value={item.quantity}
                onChange={(e) => updateQuantity(e.target.value)}
                onBlur={() => {
                  if (!item.quantity || Number(item.quantity) < 1) {
                    onChange({ quantity: 1 })
                  }
                }}
              />
            </label>
          </div>

          <div className="cart-confirm-summary">
            <span>
              <strong>Selected option:</strong>{' '}
              {item.variant || 'Configuration to be confirmed'}
            </span>
            <span>
              <strong>Quantity:</strong>{' '}
              {Number.parseInt(item.quantity, 10) || 1}
            </span>
          </div>

          <p className="muted">
            Review the selected option and quantity before adding this item.
            Nothing will be added until you confirm.
          </p>

          <div className="form-actions">
            <button
              className="btn primary"
              type="button"
              onClick={confirm}
            >
              Confirm add to cart
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function CartModal({ cart, setCart, onClose, onQuotationCreated, onManageQuotation }) {
  const [showCheckout, setShowCheckout] = useState(false)
  const [form, setForm] = useState(emptyCheckout)
  const [status, setStatus] = useState({ type: 'idle', message: '', referenceNumber: '' })
  const closeRef = useRef(null)

  useEffect(() => {
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', listener)
    return () => {
      document.body.style.overflow = old
      window.removeEventListener('keydown', listener)
    }
  }, [onClose])

  const lines = cart
    .map((line) => ({ ...line, product: catalog.find((item) => item.id === line.productId) }))
    .filter((line) => line.product)
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0)

  function updateLine(index, patch) {
    setCart((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  function removeLine(index) {
    setCart((current) => current.filter((_, lineIndex) => lineIndex !== index))
  }

  function updateForm(e) {
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!lines.length || status.type === 'loading') return
    setStatus({ type: 'loading', message: 'Sending quotation request…', referenceNumber: '' })

    try {
      const data = await schemaApi.createQuotation({
        ...form,
        items: lines.map((line) => ({
          productName: line.product.name,
          productModel: dbSafeModel(line.product.model),
          productSize: line.variant || '',
          quantity: Number(line.quantity),
          itemDescription: line.product.profileLabel || '',
        })),
      })

      onQuotationCreated(data.referenceNumber)
      setStatus({
        type: 'success',
        message: data.message || 'Quotation request submitted.',
        referenceNumber: data.referenceNumber || '',
      })
      setCart([])
    } catch (error) {
      const message = error instanceof TypeError
        ? 'The quotation service is temporarily unreachable. Please try again or contact Katala directly.'
        : (error.message || 'Unable to send quotation request.')
      setStatus({ type: 'error', message, referenceNumber: '' })
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-modal cart-modal" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="cart-panel">
          <div className="cart-heading">
            <div><span className="eyebrow">YOUR CART</span><h2 id="cart-title">Quotation request</h2></div>
            <div className="cart-heading-total">
              <strong>{totalUnits} item{totalUnits === 1 ? '' : 's'}</strong>
              <span>Estimated amount after staff review</span>
            </div>
          </div>

          {lines.length > 0 ? (
            <div className="cart-lines">
              {lines.map((line, index) => (
                <article className="cart-line" key={`${line.productId}-${line.variant}-${index}`}>
                  <img src={productImage(line.product)} alt="" />
                  <div className="cart-line-copy">
                    <strong>{line.product.name}</strong>
                    <span>{line.product.model}</span>
                    <span>Material pricing will be set by Katala staff.</span>
                    {line.product.variants.length > 0 && (
                      <label>
                        Option
                        <select value={line.variant} onChange={(e) => updateLine(index, { variant: e.target.value })}>
                          {line.product.variants.map((value) => <option key={value}>{value}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="cart-qty">
                    Qty
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Math.min(999, Math.max(1, Number.parseInt(e.target.value, 10) || 1)) })}
                    />
                  </label>
                  <button className="cart-remove" type="button" onClick={() => removeLine(index)}>Remove</button>
                </article>
              ))}
            </div>
          ) : status.type !== 'success' ? (
            <div className="empty-state cart-empty"><h3>Your cart is empty.</h3><p>Add a product before sending a quotation request.</p></div>
          ) : null}

          {lines.length > 0 && !showCheckout && (
            <div className="cart-footer-actions">
              <button className="btn secondary" type="button" onClick={() => setCart([])}>Clear cart</button>
              <button className="btn primary" type="button" onClick={() => { if (!isSignedIn()) { sessionStorage.setItem('katala-return-after-auth', 'products'); location.hash = 'signin'; return } setShowCheckout(true) }}>Continue to request</button>
            </div>
          )}

          {showCheckout && lines.length > 0 && (
            <form className="order-form cart-checkout" onSubmit={submit}>
              <div className="form-heading">
                <div><span className="eyebrow">QUOTATION DETAILS</span><h3>Send one quotation request for your cart</h3></div>
                <p>Provide the project details Katala needs to review the requested products and prepare a quotation.</p>
              </div>
              <div className="form-grid">
                <label>Project name<input maxLength="160" name="projectName" value={form.projectName} onChange={updateForm} /></label>
                <label>Establishment / organization<input maxLength="160" name="establishmentName" value={form.establishmentName} onChange={updateForm} /></label>
                <label className="wide">Project address<textarea maxLength="1000" rows="2" name="projectAddress" value={form.projectAddress} onChange={updateForm} /></label>
                <label className="wide">Project description<textarea maxLength="2000" rows="3" name="projectDescription" value={form.projectDescription} onChange={updateForm} placeholder="Describe the intended use or project requirements." /></label>
                <label className="wide">Customer remarks<textarea maxLength="2000" rows="3" name="customerRemarks" value={form.customerRemarks} onChange={updateForm} placeholder="Questions or additional notes for Katala." /></label>
              </div>
              {status.type !== 'idle' && (
                <div className={`form-status ${status.type}`} role="status">
                  {status.message}
                  {status.referenceNumber && <><br /><strong>Reference: {status.referenceNumber}</strong></>}
                </div>
              )}
              <div className="form-actions">
                <button className="btn primary" disabled={status.type === 'loading'}>{status.type === 'loading' ? 'Sending…' : 'Request quotation'}</button>
                <button className="btn secondary" type="button" onClick={() => setShowCheckout(false)}>Back to cart</button>
              </div>
            </form>
          )}

          {status.type === 'success' && (
            <div className="order-success-block">
              <h3>Quotation request submitted</h3>
              <p>{status.message}</p>
              <p><strong>Reference: {status.referenceNumber}</strong></p>
              <p className="muted">Katala staff will review the request, set charges, and mark it ready for payment when finalized.</p>
              <div className="form-actions">
                <button className="btn primary" type="button" onClick={onManageQuotation}>Manage quotation</button>
                <button className="btn secondary" type="button" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ManageQuotationModal({ quotationRefs, setQuotationRefs, initialPaymentReference = '', onInitialPaymentHandled, onClose }) {
  const [selectedReference, setSelectedReference] = useState(quotationRefs[0]?.referenceNumber || '')
  const [quotation, setQuotation] = useState(null)
  const [form, setForm] = useState(emptyCheckout)
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const [checkoutStatus, setCheckoutStatus] = useState({ type: 'idle', message: '' })
  const [receipt, setReceipt] = useState(null)
  const closeRef = useRef(null)

  useEffect(() => {
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', listener)
    return () => {
      document.body.style.overflow = old
      window.removeEventListener('keydown', listener)
    }
  }, [onClose])

  useEffect(() => {
    if (!selectedReference) return
    let cancelled = false
    setQuotation(null)
    setCheckoutStatus({ type: 'idle', message: '' })
    setStatus({ type: 'loading', message: 'Loading quotation…' })

    schemaApi.getQuotation(selectedReference)
      .then((data) => {
        if (cancelled) return
        const loaded = data.quotation
        setQuotation(loaded)
        setForm({
          projectName: loaded.projectName || '',
          establishmentName: loaded.establishmentName || '',
          projectDescription: loaded.projectDescription || '',
          projectAddress: loaded.projectAddress || '',
          customerRemarks: loaded.customerRemarks || '',
        })
        setStatus({ type: 'idle', message: '' })
      })
      .catch((error) => !cancelled && setStatus({ type: 'error', message: error.message || 'Unable to load quotation.' }))

    return () => { cancelled = true }
  }, [selectedReference])

  useEffect(() => {
    if (!initialPaymentReference) return
    let cancelled = false
    setCheckoutStatus({ type: 'loading', message: 'Confirming payment status...' })

    schemaApi.getPaymentReceipt(initialPaymentReference)
      .then((data) => {
        if (cancelled) return
        setReceipt(data.receipt)
        setCheckoutStatus({
          type: data.receipt?.payment?.status === 'Paid' ? 'success' : 'loading',
          message: data.receipt?.payment?.status === 'Paid'
            ? 'Payment confirmed. Receipt is ready.'
            : 'Payment is still pending. Please refresh again in a moment.',
        })
        if (data.receipt?.quotationReference) setSelectedReference(data.receipt.quotationReference)
      })
      .catch((error) => !cancelled && setCheckoutStatus({ type: 'error', message: error.message || 'Unable to confirm payment.' }))
      .finally(() => {
        if (!cancelled) onInitialPaymentHandled?.()
      })

    return () => { cancelled = true }
  }, [initialPaymentReference, onInitialPaymentHandled])

  function update(e) {
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }))
  }

  async function save(e) {
    e.preventDefault()
    if (!selectedReference) return
    setStatus({ type: 'loading', message: 'Saving changes…' })

    try {
      const data = await schemaApi.updateQuotation(selectedReference, form)
      setQuotation(data.quotation)
      setStatus({ type: 'success', message: 'Quotation request updated.' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update quotation.' })
    }
  }

  async function cancelQuotation() {
    if (!selectedReference || !window.confirm(`Cancel quotation request ${selectedReference}? This action will mark the request as cancelled.`)) return
    setStatus({ type: 'loading', message: 'Cancelling quotation…' })

    try {
      const data = await schemaApi.cancelQuotation(selectedReference)
      const next = quotationRefs.filter((item) => item.referenceNumber !== selectedReference)
      setQuotationRefs(next)
      setQuotation(null)
      setSelectedReference(next[0]?.referenceNumber || '')
      setStatus({ type: 'success', message: data.message || 'Quotation request cancelled.' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to cancel quotation.' })
    }
  }

  const displayStatus = displayQuotationStatus(quotation?.status)
  const editable = ['Submitted', 'Under Review'].includes(quotation?.status)
  const paid = quotation?.payment?.status === 'Paid'

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-modal manage-order-modal" role="dialog" aria-modal="true" aria-labelledby="manage-title">
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="manage-order-panel">
          <span className="eyebrow">QUOTATION MANAGEMENT</span>
          <h2 id="manage-title">Manage your quotation request</h2>
          <p className="muted">Review your saved quotation request, update project details while it is still open, or cancel it when no longer needed.</p>

          {quotationRefs.length > 1 && (
            <label className="manage-select">
              Saved reference
              <select value={selectedReference} onChange={(e) => setSelectedReference(e.target.value)}>
                {quotationRefs.map((item) => <option key={item.referenceNumber}>{item.referenceNumber}</option>)}
              </select>
            </label>
          )}

          {quotation && (
            <>
              <div className="managed-order-summary">
                <div><span>Reference</span><strong>{quotation.referenceNumber}</strong></div>
                <div><span>Status</span><strong>{displayStatus}</strong></div>
                <div><span>Pricing</span><strong>{paid ? 'Paid' : 'Pending staff review'}</strong></div>
                <div><span>Submitted</span><strong>{quotation.submittedAt ? new Date(quotation.submittedAt).toLocaleString() : '—'}</strong></div>
              </div>

              <div className="managed-items">
                {quotation.items?.map((item, index) => (
                  <div key={`${item.productCode || item.productName}-${index}`}>
                    <strong>{item.productName}</strong>
                    <span>{item.productSize || item.productModel || item.productCode || 'Variant'} · Qty {item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="form-status loading">Final charges and payment will appear in your Profile after Katala staff reviews this quotation.</div>

              {checkoutStatus.type !== 'idle' && <div className={`form-status ${checkoutStatus.type}`}>{checkoutStatus.message}</div>}

              <form className="order-form manage-form" onSubmit={save}>
                <div className="form-grid">
                  <label>Project name<input disabled={!editable} maxLength="160" name="projectName" value={form.projectName} onChange={update} /></label>
                  <label>Establishment<input disabled={!editable} maxLength="160" name="establishmentName" value={form.establishmentName} onChange={update} /></label>
                  <label className="wide">Project address<textarea disabled={!editable} maxLength="1000" rows="2" name="projectAddress" value={form.projectAddress} onChange={update} /></label>
                  <label className="wide">Project description<textarea disabled={!editable} maxLength="2000" rows="3" name="projectDescription" value={form.projectDescription} onChange={update} /></label>
                  <label className="wide">Customer remarks<textarea disabled={!editable} maxLength="2000" rows="3" name="customerRemarks" value={form.customerRemarks} onChange={update} /></label>
                </div>

                {!editable && <div className="form-status success">This quotation is read-only because its status is {displayStatus}.</div>}
                {status.type !== 'idle' && <div className={`form-status ${status.type}`}>{status.message}</div>}

                <div className="form-actions manage-actions">
                  <button className="btn primary" disabled={!editable || status.type === 'loading'}>Update quotation</button>
                  <button className="btn danger" type="button" disabled={status.type === 'loading' || quotation.status === 'Cancelled'} onClick={cancelQuotation}>Cancel quotation</button>
                </div>
              </form>
            </>
          )}

          {!quotation && status.type !== 'loading' && (
            <div className={`form-status ${status.type === 'idle' ? 'error' : status.type}`}>
              {status.message || 'No saved quotation reference is available.'}
            </div>
          )}
          {status.type === 'loading' && !quotation && <div className="form-status loading">{status.message}</div>}
        </div>
      </section>
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function ReceiptModal({ receipt, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [onClose])

  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Close">Ã—</button>
        <div className="receipt-panel">
          <div className="receipt-heading">
            <div>
              <span className="eyebrow">OFFICIAL RECEIPT</span>
              <h2 id="receipt-title">{receipt.receiptNumber || 'Receipt pending'}</h2>
              <p className="muted">Quotation {receipt.quotationReference}</p>
            </div>
            <strong>{formatPeso(receipt.totalAmount)}</strong>
          </div>

          <div className="receipt-meta">
            <div><span>Customer</span><strong>{receipt.customerName || 'Customer'}</strong></div>
            <div><span>Email</span><strong>{receipt.customerEmail || 'Not provided'}</strong></div>
            <div><span>Paid at</span><strong>{receipt.paidAt ? new Date(receipt.paidAt).toLocaleString() : 'Pending'}</strong></div>
            <div><span>Method</span><strong>{receipt.paymentMethod || 'PayMongo'}</strong></div>
          </div>

          <div className="receipt-lines">
            {receipt.items?.map((item, index) => (
              <div key={`${item.productCode || item.productName}-${index}`}>
                <div>
                  <strong>{item.productName}</strong>
                  <span>{item.productSize || item.productModel || item.productCode || 'Item'} - Qty {item.quantity}</span>
                </div>
                <span>{formatPeso(item.lineTotal)}</span>
              </div>
            ))}
            {Number(receipt.additionalCost || 0) > 0 && (
              <div>
                <div>
                  <strong>Additional project cost</strong>
                  <span>Reviewed quotation adjustment</span>
                </div>
                <span>{formatPeso(receipt.additionalCost)}</span>
              </div>
            )}
          </div>

          <div className="receipt-total">
            <span>Total paid</span>
            <strong>{formatPeso(receipt.totalAmount)}</strong>
          </div>

          <div className="form-actions">
            <button className="btn primary" type="button" onClick={() => window.print()}>Print receipt</button>
            <button className="btn secondary" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </section>
    </div>
  )
}
