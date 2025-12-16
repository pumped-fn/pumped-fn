type MyExecutor = Core.Executor<string>
type MyController = Core.Controller
type MyAccessor = Core.Accessor<number>
type MyLazy = Core.Lazy<boolean>
type MyReactive = Core.Reactive<Config>
type MyStatic = Core.Static<User>
type MyPreset = Core.Preset<Database>
type MyAnyExecutor = Core.AnyExecutor
type MyTag = Tag.Tag<string>
type MyTagged = Tag.Tagged<number>
type MyTagSource = Tag.Source

interface ComplexType {
  exec: Core.Executor<Data>
  ctrl: Core.Controller
  accessor: Core.Accessor<State>
  tag: Tag.Tag<Value>
}

class Service {
  private executor: Core.Executor<Config>
  private tag: Tag.Tag<string>

  getAccessor(): Core.Accessor<Config> {
    return {} as Core.Accessor<Config>
  }
}
