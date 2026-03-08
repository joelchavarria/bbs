import {
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  ImageIcon,
  Gift,
  Lock,
  MapPin,
  Search,
  Shirt,
  Upload,
  Users,
} from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import invitados from "@/data/invitados.json"
import { supabase, supabaseBucket } from "@/lib/supabase"

const EVENT_START = new Date("2026-05-03T10:00:00-06:00")
const EVENT_END = new Date("2026-05-03T13:00:00-06:00")
const PHOTOS_OPEN_AT = new Date("2026-05-03T00:00:00-06:00")
const RSVP_EMAIL = "joelchavarria308@gmail.com"
const MAPS_QUERY = "https://maps.app.goo.gl/p9Pe2d78kaNzUqReA"
const MAPS_EMBED =
  "https://www.google.com/maps?q=La+Guacamaya+Granada+La+Calzada&output=embed"
const INVITE_TEMPLATE = "/venue/INVIT.jpeg"
const PAGE_STORAGE_KEY = "bbs_current_page"
const ADMIN_PATH = "/confirmacionesbbs"
const ADMIN_PIN = "0126"
const ADMIN_UNLOCK_KEY = "bbs_admin_unlocked"
const NAV_PAGES = ["Inicio", "Ubicación", "RSVP", "Fotos"]
const VENUE_PHOTOS = [
  "https://scontent.fmga3-1.fna.fbcdn.net/v/t39.30808-6/546595088_1092996142956515_5799627265149833480_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=dd6889&_nc_ohc=igEsnQD_QQYQ7kNvwG8b2ew&_nc_oc=AdkRMOaWXRZ3D9Fs1xrCuBnsWMqir6CXgg6FVnMVRA6TQOahAj66Bt1KG5qBhCDI1GHIRbDvRIfNH8fXoP2L0hBD&_nc_zt=23&_nc_ht=scontent.fmga3-1.fna&_nc_gid=vKx_u-0zGAOZfuGKxdq92Q&_nc_ss=8&oh=00_Afy4bEWWDW2_6YEWgnQdVQjotVnoKK_tuybrAXq37C0jQA&oe=69B296CA",
  "/venue/foto-2.svg",
  "/venue/foto-3.svg",
]

type Invitado = {
  id: number
  nombre: string
  familia: string
  invitados: number
  miembrosFamilia: string[]
}

type FamiliaInvitada = {
  familia: string
  miembros: string[]
}

type InvitadoIndividual = {
  nombre: string
}

type InvitadoRaw = FamiliaInvitada | InvitadoIndividual

type RsvpPayload = {
  invitadoId: number
  nombre: string
  familia: string
  asistencia: "si" | "no"
  personas: number
  mensaje: string
  creadoEn: string
  userAgent: string
}
const RSVP_TABLE =
  (import.meta.env.VITE_RSVP_TABLE as string | undefined) ?? "confirmaciones"

type UploadedPhoto = {
  name: string
  url: string
}

type StorageListItem = {
  name: string
}

type Confirmacion = {
  id: number
  timestamp: string
  nombre: string
  familia: string
  asistencia: "si" | "no"
  personas: number
  mensaje: string
  cupo_familia: number | null
  miembros_familia: string | null
  confirmado_por: string | null
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function getCountdown() {
  const diff = EVENT_START.getTime() - Date.now()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, finished: true }
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)

  return { days, hours, minutes, finished: false }
}

function getPhotosCountdown() {
  const diff = PHOTOS_OPEN_AT.getTime() - Date.now()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, unlocked: true }
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)

  return { days, hours, minutes, unlocked: false }
}

function isFamiliaInvitada(entry: InvitadoRaw): entry is FamiliaInvitada {
  return "familia" in entry && "miembros" in entry
}

function App() {
  const isAdminRoute =
    typeof window !== "undefined" &&
    window.location.pathname.toLowerCase() === ADMIN_PATH
  const [countdown, setCountdown] = useState(getCountdown)
  const [photosCountdown, setPhotosCountdown] = useState(getPhotosCountdown)
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === "undefined") {
      return 0
    }
    const savedPage = window.localStorage.getItem(PAGE_STORAGE_KEY)
    const parsedPage = Number(savedPage)
    if (
      Number.isInteger(parsedPage) &&
      parsedPage >= 0 &&
      parsedPage <= NAV_PAGES.length - 1
    ) {
      return parsedPage
    }
    return 0
  })
  const [search, setSearch] = useState("")
  const [highlightedGuestIndex, setHighlightedGuestIndex] = useState(0)
  const [selected, setSelected] = useState<Invitado | null>(null)
  const [attendance, setAttendance] = useState<"si" | "no">("si")
  const [people, setPeople] = useState(1)
  const [message, setMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [submitMessage, setSubmitMessage] = useState("")
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">(
    "idle",
  )
  const [inviteMessage, setInviteMessage] = useState("")
  const [invitePreview, setInvitePreview] = useState("")
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false)
  const [photoUploaderName, setPhotoUploaderName] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoStatus, setPhotoStatus] = useState("")
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [galleryPhotos, setGalleryPhotos] = useState<UploadedPhoto[]>([])
  const [isLoadingGallery, setIsLoadingGallery] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState("")
  const [adminError, setAdminError] = useState("")
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }
    return window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1"
  })
  const [isLoadingConfirmaciones, setIsLoadingConfirmaciones] = useState(false)
  const [confirmacionesError, setConfirmacionesError] = useState("")
  const [confirmaciones, setConfirmaciones] = useState<Confirmacion[]>([])

  const invitadosPlanos = useMemo(() => {
    const data = invitados as InvitadoRaw[]
    let nextId = 1

    return data.flatMap((entry) => {
      if (isFamiliaInvitada(entry)) {
        const cupo = Math.max(1, entry.miembros.length)
        return entry.miembros.map((nombre) => ({
          id: nextId++,
          nombre,
          familia: entry.familia,
          invitados: cupo,
          miembrosFamilia: entry.miembros,
        }))
      }

      return [
        {
          id: nextId++,
          nombre: entry.nombre,
          familia: "INVITADO INDIVIDUAL",
          invitados: 1,
          miembrosFamilia: [entry.nombre],
        },
      ]
    })
  }, [])

  const floatingChicks = useMemo(() => {
    const icons = ["🐥", "🐤", "🐣", "🐥", "🐤", "🐣", "🐥", "🐤"]
    return icons.map((icon) => {
      const isLeftSide = Math.random() > 0.5
      const x = isLeftSide
        ? `${Math.floor(2 + Math.random() * 12)}%`
        : `${Math.floor(86 + Math.random() * 10)}%`
      const y = `${Math.floor(8 + Math.random() * 82)}%`
      const size = `${Math.floor(16 + Math.random() * 10)}px`
      const delay = `${(Math.random() * 1.8).toFixed(2)}s`

      return { icon, x, y, size, delay }
    })
  }, [])

  const backgroundBubbles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => {
        const side = index % 2 === 0
        const left = side
          ? `${Math.floor(1 + Math.random() * 18)}%`
          : `${Math.floor(80 + Math.random() * 18)}%`
        const top = `${Math.floor(2 + Math.random() * 94)}%`
        const size = `${Math.floor(24 + Math.random() * 70)}px`
        const color =
          index % 3 === 0
            ? "rgba(126, 208, 249, 0.34)"
            : "rgba(255, 239, 146, 0.34)"
        const delay = `${(Math.random() * 3).toFixed(2)}s`

        return { left, top, size, color, delay }
      }),
    [],
  )

  const pages = NAV_PAGES
  const lastPage = pages.length - 1

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(getCountdown()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(
      () => setPhotosCountdown(getPhotosCountdown()),
      30_000,
    )
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })

    // Some browsers restore scroll after paint; force top once more.
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.history.scrollRestoration = previousRestoration
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(PAGE_STORAGE_KEY, String(currentPage))
  }, [currentPage])

  const dateLabel = "Domingo, 3 de Mayo 2026"

  const timeLabel = useMemo(() => {
    const start = EVENT_START.toLocaleTimeString("es-NI", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    const end = EVENT_END.toLocaleTimeString("es-NI", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })

    return `${start} a ${end}`
  }, [])

  const filteredGuests = useMemo(() => {
    const term = normalize(search.trim())

    if (!term) {
      return []
    }

    return invitadosPlanos
      .filter((guest) => normalize(guest.nombre).includes(term))
      .slice(0, 8)
  }, [invitadosPlanos, search])
  const searchTerm = search.trim()
  const shouldShowSearchState = searchTerm.length > 0 && !selected

  useEffect(() => {
    if (shouldShowSearchState && filteredGuests.length > 0) {
      setHighlightedGuestIndex((prev) =>
        Math.min(Math.max(prev, 0), filteredGuests.length - 1),
      )
      return
    }
    setHighlightedGuestIndex(0)
  }, [filteredGuests.length, shouldShowSearchState])

  useEffect(() => {
    if (currentPage === 3) {
      void loadGalleryPhotos()
    }
  }, [currentPage])

  useEffect(() => {
    if (isAdminRoute && isAdminUnlocked) {
      void loadConfirmaciones()
    }
  }, [isAdminRoute, isAdminUnlocked])

  const canSubmit = Boolean(selected) && (attendance === "no" || people > 0)

  const emailHref = useMemo(() => {
    if (!selected) {
      return ""
    }

    const body = [
      `Invitado: ${selected.nombre}`,
      `Familia: ${selected.familia}`,
      `Asistencia: ${attendance === "si" ? "Sí" : "No"}`,
      `Personas: ${attendance === "si" ? people : 0}`,
      `Mensaje: ${message || "Sin mensaje"}`,
    ].join("\n")

    const subject = `RSVP Baby Shower Lucas Joel - ${selected.nombre}`

    return `mailto:${RSVP_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }, [attendance, message, people, selected])

  const confirmacionesSi = useMemo(
    () => confirmaciones.filter((row) => row.asistencia === "si"),
    [confirmaciones],
  )
  const confirmacionesNo = useMemo(
    () => confirmaciones.filter((row) => row.asistencia === "no"),
    [confirmaciones],
  )

  function goToPage(index: number) {
    const safeIndex = Math.max(0, Math.min(lastPage, index))
    setCurrentPage(safeIndex)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function clearInviteArtifacts() {
    setInvitePreview("")
    setInviteMessage("")
  }

  function selectGuest(guest: Invitado) {
    setSelected(guest)
    setSearch(guest.nombre)
    setPeople(1)
    setHighlightedGuestIndex(0)
    clearInviteArtifacts()
  }

  async function loadConfirmaciones() {
    if (!supabase) {
      setConfirmacionesError("Supabase no está configurado en este proyecto.")
      return
    }

    setIsLoadingConfirmaciones(true)
    setConfirmacionesError("")
    try {
      const { data, error } = await supabase
        .from(RSVP_TABLE)
        .select(
          "id,timestamp,nombre,familia,asistencia,personas,mensaje,cupo_familia,miembros_familia,confirmado_por",
        )
        .order("timestamp", { ascending: false })
        .limit(300)

      if (error) {
        throw error
      }

      setConfirmaciones((data as Confirmacion[] | null) ?? [])
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido"
      setConfirmacionesError(`No se pudieron cargar las confirmaciones. ${detail}`)
    } finally {
      setIsLoadingConfirmaciones(false)
    }
  }

  function handleAdminUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adminPinInput !== ADMIN_PIN) {
      setAdminError("PIN incorrecto.")
      return
    }
    setAdminError("")
    setIsAdminUnlocked(true)
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1")
    }
  }

  async function loadGalleryPhotos() {
    if (!supabase) {
      setPhotoStatus(
        "Falta configuración de Supabase. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
      )
      return
    }
    const client = supabase

    setIsLoadingGallery(true)
    try {
      const { data, error } = await client.storage
        .from(supabaseBucket)
        .list(undefined, {
          limit: 60,
          sortBy: { column: "created_at", order: "desc" },
        })

      if (error) {
        throw error
      }

      const files =
        data
          ?.filter(
            (item: StorageListItem) =>
              Boolean(item.name) &&
              !item.name.endsWith("/") &&
              /\.(jpe?g|png|webp)$/i.test(item.name),
          )
          .map((item: StorageListItem) => {
            const { data: publicUrlData } = client.storage
              .from(supabaseBucket)
              .getPublicUrl(item.name)
            return { name: item.name, url: publicUrlData.publicUrl }
          }) ?? []

      setGalleryPhotos(files)
    } catch {
      setPhotoStatus("No se pudo cargar la galería en este momento.")
    } finally {
      setIsLoadingGallery(false)
    }
  }

  async function handleUploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      setPhotoStatus(
        "Falta configuración de Supabase. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
      )
      return
    }
    const client = supabase

    if (!photoFile) {
      setPhotoStatus("Selecciona una foto para subir.")
      return
    }

    if (!photoUploaderName.trim()) {
      setPhotoStatus("Escribe tu nombre antes de subir la foto.")
      return
    }

    setIsUploadingPhoto(true)
    setPhotoStatus("")
    try {
      const safeName = photoUploaderName
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      const ext = photoFile.name.split(".").pop()?.toLowerCase() ?? "jpg"
      const filePath = `${Date.now()}-${safeName || "invitado"}.${ext}`

      const { error } = await client.storage
        .from(supabaseBucket)
        .upload(filePath, photoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: photoFile.type,
        })

      if (error) {
        throw error
      }

      setPhotoStatus("Foto subida correctamente. ¡Gracias por compartir!")
      setPhotoFile(null)
      await loadGalleryPhotos()
    } catch {
      setPhotoStatus(
        "No se pudo subir la foto. Verifica tamaño, formato y políticas del bucket.",
      )
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selected) {
      return
    }

    setIsSaving(true)
    setSubmitMessage("")
    setSubmitStatus("idle")

    const payload: RsvpPayload = {
      invitadoId: selected.id,
      nombre: selected.nombre,
      familia: selected.familia,
      asistencia: attendance,
      personas: attendance === "si" ? people : 0,
      mensaje: message.trim(),
      creadoEn: new Date().toISOString(),
      userAgent: navigator.userAgent,
    }
    try {
      if (!supabase) {
        throw new Error("Supabase no configurado")
      }
      const groupKey = normalize(
        selected.familia === "INVITADO INDIVIDUAL"
          ? `individual:${selected.nombre}`
          : `familia:${selected.familia}`,
      )
      const { error } = await supabase.from(RSVP_TABLE).upsert({
        grupo_key: groupKey,
        timestamp: payload.creadoEn,
        invitado_id: payload.invitadoId,
        nombre: payload.nombre,
        familia: payload.familia,
        confirmado_por: payload.nombre,
        asistencia: payload.asistencia,
        personas: payload.personas,
        mensaje: payload.mensaje,
        cupo_familia: selected.invitados,
        miembros_familia: selected.miembrosFamilia.join(" | "),
        origen: "web-baby-shower",
        ip: "",
        user_agent: payload.userAgent,
      }, { onConflict: "grupo_key" })
      if (error) {
        throw error
      }

      setSubmitMessage(
        "Reserva guardada correctamente.",
      )
      setSubmitStatus("success")
      setMessage("")
    } catch (error) {
      const isMissingSupabase =
        error instanceof Error && error.message.includes("Supabase no configurado")
      const detail = error instanceof Error ? ` Detalle: ${error.message}` : ""
      setSubmitMessage(
        isMissingSupabase
          ? "Falta configurar Supabase para guardar confirmaciones."
          : `No se pudo guardar la reserva en este momento.${detail}`,
      )
      setSubmitStatus("error")
    } finally {
      setIsSaving(false)
    }
  }

  function wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) {
    const words = text.split(" ")
    const lines: string[] = []
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const measure = context.measureText(testLine).width
      if (measure <= maxWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
        }
        currentLine = word
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
  }

  async function generateInviteImage() {
    if (!selected) {
      throw new Error("Selecciona un invitado")
    }

    try {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = INVITE_TEMPLATE

      await image.decode()

      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")

      if (!context) {
        throw new Error("No se pudo crear el lienzo")
      }

      context.drawImage(image, 0, 0)

      const isFamily = selected.familia !== "INVITADO INDIVIDUAL"
      let textLines: string[] = isFamily ? [...selected.miembrosFamilia] : [selected.nombre]

      const boxWidth = canvas.width * 0.72
      const boxX = (canvas.width - boxWidth) / 2
      const boxY = canvas.height * 0.57
      const radius = 18
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.font = `700 ${Math.max(16, Math.floor(canvas.width * 0.024))}px "Nunito", sans-serif`
      if (isFamily && selected.miembrosFamilia.length > 2) {
        const grouped: string[] = []
        for (let index = 0; index < selected.miembrosFamilia.length; index += 2) {
          grouped.push(
            selected.miembrosFamilia.slice(index, index + 2).join(" • "),
          )
        }
        textLines = grouped
      }

      textLines = textLines
        .flatMap((line) => wrapText(context, line, boxWidth * 0.88))
        .slice(0, 4)
      const lineHeight = Math.max(22, Math.floor(canvas.width * 0.03))
      const verticalPadding = Math.max(22, Math.floor(canvas.height * 0.014))
      const boxHeight = textLines.length * lineHeight + verticalPadding * 2

      context.fillStyle = "rgba(255, 255, 255, 0.85)"
      context.beginPath()
      context.moveTo(boxX + radius, boxY)
      context.lineTo(boxX + boxWidth - radius, boxY)
      context.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius)
      context.lineTo(boxX + boxWidth, boxY + boxHeight - radius)
      context.quadraticCurveTo(
        boxX + boxWidth,
        boxY + boxHeight,
        boxX + boxWidth - radius,
        boxY + boxHeight,
      )
      context.lineTo(boxX + radius, boxY + boxHeight)
      context.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius)
      context.lineTo(boxX, boxY + radius)
      context.quadraticCurveTo(boxX, boxY, boxX + radius, boxY)
      context.closePath()
      context.fill()

      context.fillStyle = "#7a5a1b"
      const textStartY =
        boxY + boxHeight / 2 - ((textLines.length - 1) * lineHeight) / 2
      textLines.forEach((line, index) => {
        context.fillText(line, canvas.width / 2, textStartY + index * lineHeight)
      })

      const safeName = textLines.join("-")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

      return {
        dataUrl: canvas.toDataURL("image/png"),
        filename: `invitacion-${safeName || "invitado"}.png`,
      }
    } catch {
      throw new Error(
        "No se pudo generar la invitación. Verifica que exista public/venue/INVIT.jpeg.",
      )
    }
  }

  async function handlePreviewInvite() {
    if (!selected) {
      return
    }

    setInviteMessage("")
    setIsGeneratingInvite(true)
    try {
      const result = await generateInviteImage()
      setInvitePreview(result.dataUrl)
    } catch (error) {
      setInvitePreview("")
      setInviteMessage(error instanceof Error ? error.message : "Error al generar invitación.")
    } finally {
      setIsGeneratingInvite(false)
    }
  }

  async function handleDownloadInvite() {
    if (!selected) {
      return
    }

    setInviteMessage("")
    setIsGeneratingInvite(true)
    try {
      const result = await generateInviteImage()
      const link = document.createElement("a")
      link.href = result.dataUrl
      link.download = result.filename
      link.click()
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Error al generar invitación.")
    } finally {
      setIsGeneratingInvite(false)
    }
  }

  if (isAdminRoute) {
    return (
      <main className="relative overflow-hidden px-3 py-6 sm:px-6 sm:py-10 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
          <section className="glass-card rounded-3xl border border-white/80 p-4 shadow-balloon sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge>Panel privado</Badge>
                <h1 className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                  Confirmaciones del Baby Shower
                </h1>
              </div>
              {isAdminUnlocked && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsAdminUnlocked(false)
                    setAdminPinInput("")
                    if (typeof window !== "undefined") {
                      window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY)
                    }
                  }}
                >
                  Cerrar panel
                </Button>
              )}
            </div>
          </section>

          {!isAdminUnlocked ? (
            <Card className="glass-card border-white/85">
              <CardContent className="p-5 sm:p-7">
                <div className="mb-3 flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-2xl">Acceso con PIN</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ingresa el PIN para ver las confirmaciones.
                </p>
                <form onSubmit={handleAdminUnlock} className="mt-4 flex flex-wrap gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={adminPinInput}
                    onChange={(event) => setAdminPinInput(event.target.value)}
                    placeholder="PIN de 4 dígitos"
                    className="h-11 rounded-2xl border bg-white/90 px-3 text-sm outline-none transition focus:border-primary"
                  />
                  <Button type="submit">Entrar</Button>
                </form>
                {adminError && (
                  <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                    {adminError}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="glass-card border-white/85">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                      Total
                    </p>
                    <p className="mt-1 font-display text-3xl text-primary">
                      {confirmaciones.length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-white/85">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                      Sí asistirán
                    </p>
                    <p className="mt-1 font-display text-3xl text-emerald-600">
                      {confirmacionesSi.length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-white/85">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                      No asistirán
                    </p>
                    <p className="mt-1 font-display text-3xl text-rose-600">
                      {confirmacionesNo.length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-white/85">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                      Personas confirmadas
                    </p>
                    <p className="mt-1 font-display text-3xl text-primary">
                      {confirmacionesSi.reduce((sum, row) => sum + (row.personas || 0), 0)}
                    </p>
                  </CardContent>
                </Card>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <Card className="glass-card border-white/85">
                  <CardContent className="p-5">
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-600">
                      Sí irán
                    </p>
                    <div className="mt-3 space-y-2">
                      {confirmacionesSi.map((row) => (
                        <div key={row.id} className="rounded-xl border border-emerald-200 bg-white/85 p-3">
                          <p className="text-sm font-semibold">{row.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.familia || "Sin familia"} · Confirmados: {row.personas}
                            {row.cupo_familia ? `/${row.cupo_familia}` : ""}
                          </p>
                          {row.miembros_familia && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Integrantes: {row.miembros_familia.split(" | ").join(" • ")}
                            </p>
                          )}
                        </div>
                      ))}
                      {confirmacionesSi.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aún no hay confirmaciones en “Sí”.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-white/85">
                  <CardContent className="p-5">
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-rose-600">
                      No irán
                    </p>
                    <div className="mt-3 space-y-2">
                      {confirmacionesNo.map((row) => (
                        <div key={row.id} className="rounded-xl border border-rose-200 bg-white/85 p-3">
                          <p className="text-sm font-semibold">{row.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.familia || "Sin familia"}
                          </p>
                          {row.miembros_familia && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Integrantes: {row.miembros_familia.split(" | ").join(" • ")}
                            </p>
                          )}
                        </div>
                      ))}
                      {confirmacionesNo.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aún no hay confirmaciones en “No”.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </section>

              <Card className="glass-card border-white/85">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Matriz de confirmaciones
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => void loadConfirmaciones()}
                      disabled={isLoadingConfirmaciones}
                    >
                      {isLoadingConfirmaciones ? "Actualizando..." : "Actualizar"}
                    </Button>
                  </div>
                  {confirmacionesError && (
                    <p className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                      {confirmacionesError}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-2xl border border-border/70 bg-white/85">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-secondary/70 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Familia</th>
                          <th className="px-3 py-2">Asistencia</th>
                          <th className="px-3 py-2">Personas</th>
                          <th className="px-3 py-2">Cupo</th>
                          <th className="px-3 py-2">Confirmó</th>
                          <th className="px-3 py-2">Integrantes</th>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Mensaje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmaciones.map((row) => (
                          <tr key={row.id} className="border-t border-border/60">
                            <td className="px-3 py-2 font-semibold">{row.nombre}</td>
                            <td className="px-3 py-2">{row.familia || "-"}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-bold ${
                                  row.asistencia === "si"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {row.asistencia === "si" ? "Sí" : "No"}
                              </span>
                            </td>
                            <td className="px-3 py-2">{row.personas}</td>
                            <td className="px-3 py-2">{row.cupo_familia ?? "-"}</td>
                            <td className="px-3 py-2">{row.confirmado_por ?? row.nombre}</td>
                            <td className="px-3 py-2">
                              {row.miembros_familia
                                ? row.miembros_familia.split(" | ").join(", ")
                                : "-"}
                            </td>
                            <td className="px-3 py-2">
                              {new Date(row.timestamp).toLocaleString("es-NI")}
                            </td>
                            <td className="px-3 py-2">{row.mensaje || "-"}</td>
                          </tr>
                        ))}
                        {confirmaciones.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-muted-foreground" colSpan={9}>
                              {isLoadingConfirmaciones
                                ? "Cargando confirmaciones..."
                                : "No hay registros todavía."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="relative overflow-hidden px-3 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto relative flex w-full max-w-7xl flex-col gap-4 sm:gap-6 lg:gap-8">
        <div className="pointer-events-none absolute inset-0 z-0 hidden md:block">
          {backgroundBubbles.map((bubble) => (
            <span
              key={`${bubble.left}-${bubble.top}-${bubble.size}`}
              className="bubble-orb"
              style={{
                left: bubble.left,
                top: bubble.top,
                width: bubble.size,
                height: bubble.size,
                background: bubble.color,
                animationDelay: bubble.delay,
              }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 hidden md:block">
          {floatingChicks.map((item) => (
            <span
              key={`${item.icon}-${item.x}-${item.y}`}
              className="absolute animate-float opacity-70"
              style={{
                left: item.x,
                top: item.y,
                fontSize: item.size,
                animationDelay: item.delay,
              }}
            >
              {item.icon}
            </span>
          ))}
        </div>
        <section className="relative z-10 glass-card rounded-[clamp(1.1rem,3vw,1.75rem)] border border-white/80 px-4 py-3 shadow-balloon sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge>Baby Shower de Lucas Joel</Badge>
              <p className="text-sm font-semibold text-muted-foreground">{pages[currentPage]}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-9 px-3"
                disabled={currentPage === 0}
                onClick={() => goToPage(currentPage - 1)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button
                className="h-9 px-3"
                disabled={currentPage === lastPage}
                onClick={() => goToPage(currentPage + 1)}
              >
                Siguiente <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pages.map((page, index) => (
              <button
                key={page}
                type="button"
                onClick={() => goToPage(index)}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.13em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  currentPage === index
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-white/80 text-muted-foreground hover:bg-white"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
            />
          </div>
        </section>

        {currentPage === 0 && (
          <section className="relative z-10 glass-card relative overflow-hidden rounded-[clamp(1.35rem,4vw,2.2rem)] border border-white/80 px-4 py-6 shadow-balloon sm:px-8 sm:py-10">
            <div className="absolute -left-8 top-16 h-28 w-28 animate-float rounded-full bg-accent/65 blur-[2px] sm:h-32 sm:w-32" />
            <div className="absolute right-5 top-7 h-24 w-24 animate-float rounded-full bg-primary/25 [animation-delay:700ms] sm:h-28 sm:w-28" />
            <div className="absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-secondary/70 blur-[2px] sm:h-36 sm:w-36" />

            <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <Badge className="mb-4 w-fit">Baby Shower</Badge>
                <h1 className="font-script whitespace-nowrap text-[clamp(1rem,6.2vw,3rem)] leading-none tracking-[0.01em] text-sky-500">
                  Lucas Joel Chavarría Zamuria
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-lg">
                  Gracias por ser parte de este momento tan especial en nuestras
                  vidas. Estamos muy felices por la llegada de nuestro bebé. Su
                  cariño y buenos deseos son el mejor regalo para nuestro
                  pequeño.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button size="lg" onClick={() => goToPage(2)}>
                    Confirmar asistencia
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => goToPage(1)}>
                    Ver mapa
                  </Button>
                </div>
              </div>
              <Card className="glass-card border-white/85">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Faltan para el evento
                  </p>
                  {countdown.finished ? (
                    <p className="rounded-2xl bg-white/75 px-4 py-5 text-center text-sm font-semibold text-primary shadow-sm">
                      Hoy celebramos este día tan esperado.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      {[
                        { label: "Días", value: countdown.days },
                        { label: "Horas", value: countdown.hours },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-2xl bg-white/75 py-3 shadow-sm"
                        >
                          <p className="font-display text-2xl text-primary sm:text-3xl">
                            {item.value}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground sm:text-xs">
                            {item.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {currentPage === 0 && (
          <>
            <section className="relative z-10 grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  title: "Fecha",
                  detail: dateLabel,
                  icon: CalendarDays,
                },
                {
                  title: "Hora",
                  detail: timeLabel,
                  icon: Clock3,
                },
                {
                  title: "Lugar",
                  detail: "La Guacamaya, Granada, La Calzada",
                  icon: MapPin,
                },
                {
                  title: "Vestimenta",
                  detail: "Código de vestimenta: Blanco",
                  icon: Shirt,
                },
              ].map((item) => (
                <Card key={item.title} className="glass-card border-white/85">
                  <CardContent className="flex h-full items-start gap-3 p-4 sm:p-5">
                    <item.icon className="mt-1 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground sm:text-sm">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm font-semibold sm:text-base">
                        {item.detail}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="relative z-10 flex justify-center">
              <Card className="glass-card w-full max-w-3xl border-white/85">
                <CardContent className="p-5 sm:p-7">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <Gift className="h-5 w-5 text-primary" />
                    <h2 className="text-center font-display text-2xl">
                      ¡Ayúdanos a preparar su llegada!
                    </h2>
                  </div>
                  <p className="text-center text-sm leading-relaxed text-muted-foreground">
                    El mejor regalo es compartir este momento contigo. Si deseas
                    ayudarnos con los preparativos para la llegada de nuestro
                    pequeño, agradecemos tus muestras de cariño en efectivo.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="relative z-10">
              <Card className="glass-card border-white/85">
                <CardContent className="p-5 sm:p-7">
                  <Badge variant="soft" className="mb-4 w-fit">
                    Programa
                  </Badge>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { hora: "10:00 AM", actividad: "Brindis de bienvenida por Lucas" },
                      { hora: "10:30 AM", actividad: "Juegos y dinámicas" },
                      { hora: "11:30 AM", actividad: "Fotos y convivencia" },
                      { hora: "12:30 PM", actividad: "Cierre y agradecimiento" },
                    ].map((item) => (
                      <div
                        key={item.hora}
                        className="rounded-2xl border border-border/70 bg-white/80 p-4"
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                          {item.hora}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {item.actividad}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {currentPage === 1 && (
          <section className="relative z-10 grid gap-4">
            <Card className="glass-card border-white/85">
              <CardContent className="p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Ubicación
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-9 px-4 text-xs"
                    onClick={() => window.open(MAPS_QUERY, "_blank")}
                  >
                    Abrir en Google Maps
                  </Button>
                </div>
                <iframe
                  src={MAPS_EMBED}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Mapa La Guacamaya Granada La Calzada"
                  className="h-[300px] w-full rounded-2xl border border-white/80 sm:h-[420px]"
                />
              </CardContent>
            </Card>

            <Card className="glass-card border-white/85">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Fotos del lugar
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {VENUE_PHOTOS.map((src, index) => (
                    <figure
                      key={src}
                      className="overflow-hidden rounded-2xl border border-white/80 bg-white/75"
                    >
                      <img
                        src={src}
                        alt={`Foto del lugar ${index + 1}`}
                        className="h-44 w-full object-cover sm:h-52"
                        loading="lazy"
                      />
                    </figure>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {currentPage === 2 && (
          <section className="relative z-10 grid gap-4">
            <Card id="rsvp" className="glass-card border-white/85">
              <CardContent className="p-5 sm:p-7">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-2xl">Reserva y Confirmación</h2>
                </div>
                <p className="text-sm font-bold uppercase tracking-[0.13em] text-primary">
                  Busca tu invitación
                </p>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="guest-search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setSelected(null)
                      setHighlightedGuestIndex(0)
                      clearInviteArtifacts()
                    }}
                    onKeyDown={(event) => {
                      if (!shouldShowSearchState || filteredGuests.length === 0) {
                        return
                      }

                      if (event.key === "ArrowDown") {
                        event.preventDefault()
                        setHighlightedGuestIndex(
                          (prev) => (prev + 1) % filteredGuests.length,
                        )
                        return
                      }

                      if (event.key === "ArrowUp") {
                        event.preventDefault()
                        setHighlightedGuestIndex(
                          (prev) =>
                            (prev - 1 + filteredGuests.length) % filteredGuests.length,
                        )
                        return
                      }

                      if (event.key === "Enter") {
                        event.preventDefault()
                        selectGuest(filteredGuests[highlightedGuestIndex] ?? filteredGuests[0])
                      }
                    }}
                    placeholder="Escribe tu nombre"
                    className="h-11 w-full rounded-2xl border bg-white/90 pl-10 pr-3 text-sm outline-none ring-0 transition focus:border-primary"
                  />
                </div>

                {searchTerm.length === 0 && !selected && (
                  <p className="mt-3 rounded-xl border border-border/70 bg-white/75 px-3 py-2 text-sm text-muted-foreground">
                    Escribe tu nombre para ver tu invitación y confirmar asistencia.
                  </p>
                )}

                {shouldShowSearchState && filteredGuests.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-border/70 bg-white/75 p-2">
                    <p className="px-2 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Coincidencias
                    </p>
                    <div className="space-y-2">
                    {filteredGuests.map((guest, index) => (
                      <button
                        key={guest.id}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          index === highlightedGuestIndex
                            ? "bg-secondary ring-1 ring-primary/30"
                            : "hover:bg-secondary"
                        }`}
                        onClick={() => {
                          selectGuest(guest)
                        }}
                      >
                        <span className="font-semibold">{guest.nombre}</span>
                        {guest.familia !== "INVITADO INDIVIDUAL" && (
                          <span className="text-xs text-muted-foreground">
                            {guest.familia}
                          </span>
                        )}
                      </button>
                    ))}
                    </div>
                  </div>
                )}
                {shouldShowSearchState && filteredGuests.length === 0 && (
                    <p className="mt-3 rounded-xl border border-border/70 bg-white/75 px-3 py-2 text-sm text-muted-foreground">
                      No encontramos ese nombre en la lista. Revisa ortografía o
                      contáctanos.
                    </p>
                  )}

                {selected ? (
                  <div className="mt-4 rounded-2xl border border-primary/30 bg-white/80 p-4">
                    {selected.familia === "INVITADO INDIVIDUAL" ? (
                      <p className="text-sm font-semibold text-sky-500">
                        {selected.nombre}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-sky-500">
                        {selected.familia}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-black">
                      Cupo máximo: {selected.invitados}{" "}
                      {selected.invitados === 1 ? "persona" : "personas"}
                    </p>
                    {selected.familia !== "INVITADO INDIVIDUAL" && (
                      <div className="mt-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-500">
                          Integrantes de tu familia
                        </p>
                        <ul className="mt-1 space-y-1 text-sm text-foreground">
                          {selected.miembrosFamilia.map((member) => (
                            <li key={member}>• {member}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 px-4"
                          onClick={handlePreviewInvite}
                          disabled={isGeneratingInvite}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {isGeneratingInvite ? "Generando..." : "Ver vista previa"}
                        </Button>
                        <Button
                          type="button"
                          className="h-10 px-4"
                          onClick={handleDownloadInvite}
                          disabled={isGeneratingInvite}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Descargar invitación
                        </Button>
                      </div>
                      {inviteMessage && (
                        <p className="mt-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                          {inviteMessage}
                        </p>
                      )}
                      {invitePreview && (
                        <div className="mt-3 rounded-2xl border border-primary/30 bg-white/80 p-3">
                          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            Vista previa de invitación
                          </p>
                          <img
                            src={invitePreview}
                            alt="Vista previa de invitación personalizada"
                            className="mx-auto w-full max-w-sm rounded-xl border border-white/80 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Selecciona tu nombre para habilitar la confirmación.
                  </p>
                )}

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className={`rounded-2xl border bg-white/80 p-3 text-sm transition ${
                        attendance === "si"
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border/70"
                      }`}
                    >
                      <input
                        type="radio"
                        name="attendance"
                        className="mr-2"
                        checked={attendance === "si"}
                        onChange={() => setAttendance("si")}
                      />
                      Sí asistiré
                    </label>
                    <label
                      className={`rounded-2xl border bg-white/80 p-3 text-sm transition ${
                        attendance === "no"
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border/70"
                      }`}
                    >
                      <input
                        type="radio"
                        name="attendance"
                        className="mr-2"
                        checked={attendance === "no"}
                        onChange={() => setAttendance("no")}
                      />
                      No asistiré
                    </label>
                  </div>

                  {attendance === "si" && (
                    <div>
                      <label
                        htmlFor="attendees-count"
                        className="mb-2 block text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground"
                      >
                        Cuántas personas asistirán
                      </label>
                      <input
                        id="attendees-count"
                        type="number"
                        min={1}
                        max={selected?.invitados ?? 1}
                        value={people}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          const max = selected?.invitados ?? 1
                          const safeValue = Number.isNaN(value)
                            ? 1
                            : Math.max(1, Math.min(max, value))
                          setPeople(safeValue)
                        }}
                        disabled={!selected}
                        className="h-11 w-full rounded-2xl border bg-white/90 px-3 text-sm outline-none transition focus:border-primary"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="guest-message"
                      className="mb-2 block text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground"
                    >
                      Mensaje (opcional)
                    </label>
                    <textarea
                      id="guest-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Escribe un mensaje para la familia"
                      className="min-h-24 w-full rounded-2xl border bg-white/90 px-3 py-2 text-sm outline-none transition focus:border-primary"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={!canSubmit || isSaving}>
                      {isSaving ? "Guardando..." : "Guardar confirmación"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!selected}
                      onClick={() => {
                        if (emailHref) {
                          window.location.href = emailHref
                        }
                      }}
                    >
                      Enviar por correo
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Tu confirmación se guarda directamente en nuestra base de datos.
                  </p>
                  {submitMessage && (
                    <p
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                        submitStatus === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {submitMessage}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </section>
        )}

        {currentPage === 3 && (
          <section className="relative z-10 grid gap-4">
            {!photosCountdown.unlocked ? (
              <Card className="glass-card border-white/85">
                <CardContent className="p-5 sm:p-7">
                  <div className="mb-3 flex items-center gap-2">
                    <Lock className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-2xl">Fotos bloqueadas</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Esta sección se habilita el domingo 03 de mayo de 2026 a las 12:00 a. m.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Este apartado para tomar y subir fotos del evento estará disponible
                    hasta ese día.
                  </p>
                  <div className="mt-4 grid max-w-md grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Días", value: photosCountdown.days },
                      { label: "Horas", value: photosCountdown.hours },
                      { label: "Min", value: photosCountdown.minutes },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl bg-white/80 py-3 shadow-sm"
                      >
                        <p className="font-display text-2xl text-primary sm:text-3xl">
                          {item.value}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground sm:text-xs">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="glass-card border-white/85">
                  <CardContent className="p-5 sm:p-7">
                    <div className="mb-3 flex items-center gap-2">
                      <Camera className="h-5 w-5 text-primary" />
                      <h2 className="font-display text-2xl">Comparte tus fotos</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sube una foto desde tu galería para recordar este día tan especial.
                    </p>

                    <form onSubmit={handleUploadPhoto} className="mt-4 grid gap-3">
                      <div>
                        <label
                          htmlFor="photo-uploader-name"
                          className="mb-2 block text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground"
                        >
                          Tu nombre
                        </label>
                        <input
                          id="photo-uploader-name"
                          type="text"
                          value={photoUploaderName}
                          onChange={(event) => setPhotoUploaderName(event.target.value)}
                          placeholder="Ejemplo: Pamela Velásquez"
                          className="h-11 w-full rounded-2xl border bg-white/90 px-3 text-sm outline-none transition focus:border-primary"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="photo-file"
                          className="mb-2 block text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground"
                        >
                          Foto (jpg, png, webp)
                        </label>
                        <input
                          id="photo-file"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                          className="block w-full rounded-2xl border bg-white/90 p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-amber-200 file:px-3 file:py-1 file:font-semibold file:text-amber-900"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={isUploadingPhoto}>
                          <Upload className="mr-2 h-4 w-4" />
                          {isUploadingPhoto ? "Subiendo..." : "Subir foto"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void loadGalleryPhotos()}
                          disabled={isLoadingGallery}
                        >
                          {isLoadingGallery ? "Actualizando..." : "Actualizar galería"}
                        </Button>
                      </div>
                    </form>

                    {photoStatus && (
                      <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-muted-foreground">
                        {photoStatus}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-card border-white/85">
                  <CardContent className="p-5 sm:p-7">
                    <div className="mb-3 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        Galería del Baby Shower
                      </p>
                    </div>
                    {isLoadingGallery ? (
                      <p className="text-sm text-muted-foreground">Cargando fotos...</p>
                    ) : galleryPhotos.length === 0 ? (
                      <div className="h-1" />
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {galleryPhotos.map((photo) => (
                          <figure
                            key={photo.name}
                            className="overflow-hidden rounded-2xl border border-white/80 bg-white/75"
                          >
                            <img
                              src={photo.url}
                              alt={photo.name}
                              className="h-28 w-full object-cover sm:h-32 lg:h-36"
                              loading="lazy"
                            />
                          </figure>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        )}

        <footer className="pb-3 text-center text-xs font-semibold text-muted-foreground sm:pb-5 sm:text-sm">
          Con amor para celebrar la llegada de Lucas 💛
        </footer>
      </div>
    </main>
  )
}

export default App
