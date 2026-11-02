import { UTooltip } from '#components'

const FieldHint = defineComponent({
  name: 'FieldHint',
  props: {
    text: { type: String, required: true },
  },
  setup(props) {
    const open = ref(false)
    return () => (
      <UTooltip
        open={open.value}
        text={props.text}
        delayDuration={0}
        disableClosingTrigger
        content={{ side: 'top' }}
        ui={{ content: 'h-auto max-w-64 items-start py-1.5', text: 'whitespace-normal' }}
        onUpdate:open={(value: boolean) => { open.value = value }}
      >
        <button
          type="button"
          class="inline-flex rounded-sm text-muted hover:text-default"
          aria-label={props.text}
          onMouseenter={() => { open.value = true }}
          onMouseleave={() => { open.value = false }}
          onFocus={() => { open.value = true }}
          onBlur={() => { open.value = false }}
          onMouseDown={(event: MouseEvent) => event.preventDefault()}
          onClick={(event: MouseEvent) => event.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25" />
            <path d="M8 7.25V11.25" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
            <circle cx="8" cy="5.15" r="0.75" fill="currentColor" />
          </svg>
        </button>
      </UTooltip>
    )
  },
})

export default FieldHint

export function fieldHint(label: string, text: string, required = false) {
  return {
    label: () => (
      <span class="inline-flex items-center gap-1">
        <span>
          {label}
          {required ? <span class="ms-0.5 text-error" aria-hidden="true">*</span> : null}
        </span>
        <FieldHint text={text} />
      </span>
    ),
  }
}

export function checkboxHint(label: string, text: string) {
  return {
    label: () => (
      <span class="inline-flex items-center gap-1">
        {label}
        <FieldHint text={text} />
      </span>
    ),
  }
}
