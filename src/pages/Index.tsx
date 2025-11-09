import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";
import { FileUpload } from "@/components/FileUpload";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-180px)]">
          {/* Left Column - Chat */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-lg">
            <ChatInterface />
          </div>

          {/* Right Column - Upload */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-lg">
            <FileUpload />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
