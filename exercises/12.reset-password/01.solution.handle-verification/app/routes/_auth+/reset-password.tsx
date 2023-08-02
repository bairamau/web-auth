import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import {
	json,
	redirect,
	type DataFunctionArgs,
	type V2_MetaFunction,
} from '@remix-run/node'
import {
	Form,
	useActionData,
	useFormAction,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx'
import { ErrorList, Field } from '~/components/forms.tsx'
import { StatusButton } from '~/components/ui/status-button.tsx'
import { prisma } from '~/utils/db.server.ts'
import { invariant } from '~/utils/misc.tsx'
import { passwordSchema } from '~/utils/user-validation.ts'
import { verifySessionStorage } from '~/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

const resetPasswordUsernameSessionKey = 'resetPasswordUsername'

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.value, 'submission.value should be defined by now')
	const target = submission.value.target
	const user = await prisma.user.findFirst({
		where: { OR: [{ email: target }, { username: target }] },
		select: { email: true, username: true },
	})
	// we don't want to say the user is not found if the email is not found
	// because that would allow an attacker to check if an email is registered
	if (!user) {
		submission.error.code = 'Invalid code'
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	verifySession.set(resetPasswordUsernameSessionKey, user.username)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

const ResetPasswordSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.refine(({ confirmPassword, password }) => password === confirmPassword, {
		message: 'The passwords did not match',
		path: ['confirmPassword'],
	})

export async function loader() {
	const resetPasswordUsername = 'get this from the session'
	return json({ resetPasswordUsername })
}

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const submission = parse(formData, {
		schema: ResetPasswordSchema,
		acceptMultipleErrors: () => true,
	})
	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value?.password) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	throw new Error('This has not yet been implemented')
}

export const meta: V2_MetaFunction = () => {
	return [{ title: 'Reset Password | Epic Notes' }]
}

export default function ResetPasswordPage() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const formAction = useFormAction()
	const navigation = useNavigation()

	const [form, fields] = useForm({
		id: 'reset-password',
		constraint: getFieldsetConstraint(ResetPasswordSchema),
		lastSubmission: actionData?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: ResetPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h1">Password Reset</h1>
				<p className="mt-3 text-body-md text-muted-foreground">
					Hi, {data.resetPasswordUsername}. No worries. It happens all the time.
				</p>
			</div>
			<Form
				method="POST"
				className="mx-auto mt-16 min-w-[368px] max-w-sm"
				{...form.props}
			>
				<Field
					labelProps={{
						htmlFor: fields.password.id,
						children: 'New Password',
					}}
					inputProps={{
						...conform.input(fields.password, { type: 'password' }),
						autoComplete: 'new-password',
						autoFocus: true,
					}}
					errors={fields.password.errors}
				/>
				<Field
					labelProps={{
						htmlFor: fields.confirmPassword.id,
						children: 'Confirm Password',
					}}
					inputProps={{
						...conform.input(fields.confirmPassword, { type: 'password' }),
						autoComplete: 'new-password',
					}}
					errors={fields.confirmPassword.errors}
				/>

				<ErrorList errors={form.errors} id={form.errorId} />

				<StatusButton
					className="w-full"
					status={
						navigation.state === 'submitting' &&
						navigation.formAction === formAction &&
						navigation.formMethod === 'POST'
							? 'pending'
							: actionData?.status ?? 'idle'
					}
					type="submit"
					disabled={navigation.state !== 'idle'}
				>
					Reset password
				</StatusButton>
			</Form>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
