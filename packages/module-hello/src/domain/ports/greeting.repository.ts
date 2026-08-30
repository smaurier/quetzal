export interface GreetingRecord {
  id: string;
  userId: string;
  message: string;
}

export interface GreetingRepository {
  save(input: { userId: string; message: string }): Promise<GreetingRecord>;
}
