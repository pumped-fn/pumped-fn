package main

import (
	"fmt"
	"os"
	"strings"
)

func generateDerive(n int) string {
	var sb strings.Builder

	typeParams := []string{"T any"}
	for i := 1; i <= n; i++ {
		typeParams = append(typeParams, fmt.Sprintf("D%d any", i))
	}

	depParams := []string{}
	for i := 1; i <= n; i++ {
		depParams = append(depParams, fmt.Sprintf("d%d Dependency", i))
	}

	factoryParams := []string{"*ResolveCtx"}
	for i := 1; i <= n; i++ {
		factoryParams = append(factoryParams, fmt.Sprintf("*Controller[D%d]", i))
	}

	deps := []string{}
	for i := 1; i <= n; i++ {
		deps = append(deps, fmt.Sprintf("d%d", i))
	}

	controllers := []string{}
	for i := 1; i <= n; i++ {
		controllers = append(controllers, fmt.Sprintf(`ctrl%d := &Controller[D%d]{
				executor: d%d.GetExecutor().(*Executor[D%d]),
				scope:    ctx.scope,
			}`, i, i, i, i))
	}

	ctrlRefs := []string{"ctx"}
	for i := 1; i <= n; i++ {
		ctrlRefs = append(ctrlRefs, fmt.Sprintf("ctrl%d", i))
	}

	sb.WriteString(fmt.Sprintf("func Derive%d[%s](\n", n, strings.Join(typeParams, ", ")))
	for _, dep := range depParams {
		sb.WriteString(fmt.Sprintf("\t%s,\n", dep))
	}
	sb.WriteString(fmt.Sprintf("\tfactory func(%s) (T, error),\n", strings.Join(factoryParams, ", ")))
	sb.WriteString("\topts ...ExecutorOption,\n")
	sb.WriteString(") *Executor[T] {\n")
	sb.WriteString("\texec := &Executor[T]{\n")
	sb.WriteString(fmt.Sprintf("\t\tdeps: []Dependency{%s},\n", strings.Join(deps, ", ")))
	sb.WriteString("\t\tfactory: func(ctx *ResolveCtx) (T, error) {\n")
	for _, ctrl := range controllers {
		sb.WriteString(fmt.Sprintf("\t\t\t%s\n", ctrl))
	}
	sb.WriteString(fmt.Sprintf("\t\t\treturn factory(%s)\n", strings.Join(ctrlRefs, ", ")))
	sb.WriteString("\t\t},\n")
	sb.WriteString("\t\ttags: make(map[any]any),\n")
	sb.WriteString("\t}\n\n")
	sb.WriteString("\tfor _, opt := range opts {\n")
	sb.WriteString("\t\topt(exec)\n")
	sb.WriteString("\t}\n\n")
	sb.WriteString("\treturn exec\n")
	sb.WriteString("}\n\n")

	return sb.String()
}

func main() {
	var output strings.Builder

	for i := 1; i <= 9; i++ {
		output.WriteString(generateDerive(i))
	}

	fmt.Print(output.String())

	if len(os.Args) > 1 && os.Args[1] == "-w" {
		file, err := os.OpenFile("../executor_generated.go", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			panic(err)
		}
		defer file.Close()

		file.WriteString("package pumped\n\n")
		file.WriteString("//go:generate go run codegen/main.go -w\n\n")
		file.WriteString(output.String())
		fmt.Println("Generated executor_generated.go")
	}
}
