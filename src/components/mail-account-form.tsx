"use client"

import * as React from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Switch } from "~/components/ui/switch"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "~/components/ui/field"
import { Loader2Icon, WifiIcon } from "lucide-react"
import { api } from "~/trpc/react"

export type MailAccountFormValues = {
  label: string
  email: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  username: string
  password: string
}

const defaultValues: MailAccountFormValues = {
  label: "",
  email: "",
  imapHost: "",
  imapPort: 993,
  imapTls: true,
  smtpHost: "",
  smtpPort: 587,
  smtpTls: true,
  username: "",
  password: "",
}

interface MailAccountFormProps {
  initialValues?: Partial<MailAccountFormValues>
  accountId?: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function MailAccountForm({
  initialValues,
  accountId,
  onSuccess,
  onCancel,
}: MailAccountFormProps) {
  const isEditing = !!accountId
  const [values, setValues] = React.useState<MailAccountFormValues>({
    ...defaultValues,
    ...initialValues,
  })
  const [testResult, setTestResult] = React.useState<{
    ok: boolean
    message: string
  } | null>(null)

  const utils = api.useUtils()

  const createMutation = api.mailAccount.create.useMutation({
    onSuccess: () => {
      void utils.mailAccount.list.invalidate()
      onSuccess?.()
    },
  })

  const updateMutation = api.mailAccount.update.useMutation({
    onSuccess: () => {
      void utils.mailAccount.list.invalidate()
      onSuccess?.()
    },
  })

  const testMutation = api.mailAccount.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult({
        ok: data.ok,
        message: data.ok
          ? "Connection successful!"
          : "Connection failed. Check your credentials.",
      })
    },
    onError: (error) => {
      setTestResult({ ok: false, message: error.message })
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function handleChange(field: keyof MailAccountFormValues, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setTestResult(null)
  }

  function handleTestConnection() {
    setTestResult(null)
    testMutation.mutate({
      imapHost: values.imapHost,
      imapPort: values.imapPort,
      imapTls: values.imapTls,
      username: values.username,
      password: values.password,
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEditing && accountId) {
      updateMutation.mutate({ id: accountId, ...values })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="label">Label</FieldLabel>
          <Input
            id="label"
            placeholder="e.g. Work Gmail"
            value={values.label}
            onChange={(e) => handleChange("label", e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email Address</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={(e) => handleChange("email", e.target.value)}
            required
          />
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">IMAP Settings</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="imapHost">Host</FieldLabel>
            <Input
              id="imapHost"
              placeholder="imap.example.com"
              value={values.imapHost}
              onChange={(e) => handleChange("imapHost", e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end gap-4">
            <Field className="flex-1">
              <FieldLabel htmlFor="imapPort">Port</FieldLabel>
              <Input
                id="imapPort"
                type="number"
                value={values.imapPort}
                onChange={(e) =>
                  handleChange("imapPort", parseInt(e.target.value, 10) || 0)
                }
                required
              />
            </Field>
            <Field orientation="horizontal" className="flex-1">
              <Switch
                id="imapTls"
                checked={values.imapTls}
                onCheckedChange={(checked) =>
                  handleChange("imapTls", !!checked)
                }
              />
              <FieldLabel htmlFor="imapTls">TLS</FieldLabel>
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">SMTP Settings</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="smtpHost">Host</FieldLabel>
            <Input
              id="smtpHost"
              placeholder="smtp.example.com"
              value={values.smtpHost}
              onChange={(e) => handleChange("smtpHost", e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end gap-4">
            <Field className="flex-1">
              <FieldLabel htmlFor="smtpPort">Port</FieldLabel>
              <Input
                id="smtpPort"
                type="number"
                value={values.smtpPort}
                onChange={(e) =>
                  handleChange("smtpPort", parseInt(e.target.value, 10) || 0)
                }
                required
              />
            </Field>
            <Field orientation="horizontal" className="flex-1">
              <Switch
                id="smtpTls"
                checked={values.smtpTls}
                onCheckedChange={(checked) =>
                  handleChange("smtpTls", !!checked)
                }
              />
              <FieldLabel htmlFor="smtpTls">TLS</FieldLabel>
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Authentication</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input
              id="username"
              placeholder="you@example.com"
              value={values.username}
              onChange={(e) => handleChange("username", e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder={isEditing ? "Leave blank to keep current" : ""}
              value={values.password}
              onChange={(e) => handleChange("password", e.target.value)}
              required={!isEditing}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      {testResult && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            testResult.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {testResult.message}
        </div>
      )}

      {saveError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError.message}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
          {isEditing ? "Update Account" : "Add Account"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testMutation.isPending}
          onClick={handleTestConnection}
        >
          {testMutation.isPending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <WifiIcon data-icon="inline-start" />
          )}
          Test Connection
        </Button>
        {onCancel && (
          <Button type="button" variant="destructive" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
