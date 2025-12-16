type MyExecutor = Lite.Atom<string>
type MyController = Lite.ResolveContext
type MyAccessor = Lite.Controller<number>
type MyLazy = Lite.ControllerDep<boolean>
type MyReactive = Lite.ControllerDep<Config>
type MyStatic = Core.Static<User>
type MyPreset = Lite.Preset<Database>
type MyAnyExecutor = Lite.Atom<unknown>
type MyTag = Lite.Tag<string>
type MyTagged = Lite.Tagged<number>
type MyTagSource = Lite.TagSource

interface ComplexType {
  exec: Lite.Atom<Data>
  ctrl: Lite.ResolveContext
  accessor: Lite.Controller<State>
  tag: Lite.Tag<Value>
}

class Service {
  private executor: Lite.Atom<Config>
  private tag: Lite.Tag<string>

  getAccessor(): Lite.Controller<Config> {
    return {} as Lite.Controller<Config>;
  }
}
