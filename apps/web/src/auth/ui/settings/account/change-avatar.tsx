import { fileToBase64 } from "@better-auth-ui/core"
import { useAuth, useSession, useUpdateUser } from "@better-auth-ui/react"
import { Camera, Trash2, Upload } from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import { toast } from "@/shared/ui/shadcn/toast"

import { UserAvatar } from "@/auth/ui/user/user-avatar"
import { cn, errMessage } from "@/lib/utils"
import { Button } from "@/shared/ui/shadcn/button"
import { Field } from "@/shared/ui/shadcn/field"
import { Label } from "@/shared/ui/shadcn/label"
import { Spinner } from "@/shared/ui/shadcn/spinner"

export type ChangeAvatarProps = {
  className?: string
}

export function ChangeAvatar({ className }: ChangeAvatarProps) {
  const { authClient, localization, avatar } = useAuth()
  const { data: session } = useSession(authClient)

  const { mutate: updateUser, isPending: updatePending } =
    useUpdateUser(authClient)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isPending = updatePending || isUploading || isDeleting

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    e.target.value = ""

    setIsUploading(true)

    try {
      const resized =
        (await avatar.resize?.(file, avatar.size, avatar.extension)) || file

      const image =
        (await avatar.upload?.(resized)) || (await fileToBase64(resized))

      updateUser(
        { image },
        {
          onSuccess: () =>
            toast.success(localization.settings.avatarChangedSuccess)
        }
      )
    } catch (error) {
      toast.error(errMessage(error, "Avatar upload failed"))
    }

    setIsUploading(false)
  }

  async function handleDelete() {
    const currentImage = session?.user.image

    updateUser(
      { image: null },
      {
        onSuccess: async () => {
          if (currentImage) {
            setIsDeleting(true)
            try {
              await avatar.delete?.(currentImage)
            } finally {
              setIsDeleting(false)
            }
          }

          toast.success(localization.settings.avatarDeletedSuccess)
        }
      }
    )
  }

  return (
    <Field className={cn("gap-3", className)}>
      <Label>{localization.settings.avatar}</Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          className="group relative size-24 shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          disabled={isPending || !session}
          onClick={() => fileInputRef.current?.click()}
          aria-label={localization.settings.changeAvatar}
        >
          <UserAvatar
            className="size-24 text-2xl [&_svg]:size-8"
            isPending={isPending}
          />
          <span className="bg-background/80 text-foreground absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100">
            {isPending ? (
              <Spinner className="size-5" />
            ) : (
              <Camera className="size-5" />
            )}
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            PNG, JPG, or GIF. Click the photo or use Upload.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!session || isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {isPending ? <Spinner /> : <Upload className="size-3.5" />}
              {localization.settings.uploadAvatar}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!session?.user.image || isPending}
              onClick={() => {
                void handleDelete()
              }}
            >
              <Trash2 className="size-3.5" />
              {localization.settings.deleteAvatar}
            </Button>
          </div>
        </div>
      </div>
    </Field>
  )
}
